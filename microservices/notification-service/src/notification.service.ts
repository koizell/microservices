import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EmailService } from './email.service';
import { Notification } from './notification.entity';
import { RabbitMqService } from './rabbitmq.service';

function normalizeServiceBaseUrl(value: string | undefined, fallback: string) {
  const candidate = String(value ?? fallback)
    .trim()
    .replace(/\/+$/, '');

  if (!candidate) {
    return fallback;
  }

  return /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
}

function buildInternalServiceHeaders(headers: Record<string, string> = {}) {
  const normalized: Record<string, string> = {
    ...headers,
    'x-forwarded-by': 'notification-service',
  };
  const internalApiKey = String(process.env.INTERNAL_API_KEY ?? '').trim();
  if (internalApiKey) {
    normalized['x-internal-api-key'] = internalApiKey;
  }
  return normalized;
}

type OrganizerRecipient = {
  id: string;
  name: string;
  email: string;
};

type OrganizerFilter = {
  organizerId?: string;
  organizerEmail?: string;
};

type TicketCampaignOptionsFilter = OrganizerFilter & {
  includeInactive?: boolean;
};

type TicketCampaignOption = {
  id: string;
  name: string;
  eventId?: string | null;
  organizerId?: string | null;
  organizerName?: string | null;
  organizerEmail?: string | null;
  category?: string | null;
  price: number;
  quantity: number;
  quantitySold: number;
  isActive: boolean;
};

type TicketCampaignAudienceRecipient = {
  userId: string | null;
  name: string;
  email: string;
  accountType: string;
  totalOrders: number;
  totalTickets: number;
  lastPurchaseAt: string | null;
};

type TicketCampaignAudience = {
  ticketType: TicketCampaignOption;
  recipients: TicketCampaignAudienceRecipient[];
  totalRecipients: number;
  totalOrders: number;
  totalTickets: number;
  roleBreakdown: {
    standard: number;
    guest: number;
    admin: number;
  };
  source: 'ticketing-service' | 'database-fallback';
};

type TicketCampaignAudienceRow = {
  userId: string | null;
  name: string;
  email: string;
  accountType: string;
  totalOrders: string | number;
  totalTickets: string | number;
  lastPurchaseAt: string | null;
};

type TicketCampaignResolvedRecipient = {
  userId: string | null;
  name: string;
  email: string;
  accountType: string;
  deliverySource: 'audience' | 'test';
};

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly dataSource: DataSource,
    private readonly rabbitMqService: RabbitMqService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    await this.rabbitMqService.consume('ticket.purchased', async (payload) => {
      await this.ingestTicketPurchased(payload);
    });
  }

  private getTicketingServiceBaseUrl() {
    return normalizeServiceBaseUrl(process.env.TICKETING_SERVICE_URL, 'http://localhost:3002');
  }

  async sendAccountConfirmationEmail(params: {
    to: string;
    name: string;
    confirmationUrl: string;
  }) {
    await this.create({
      message: `Correo de confirmacion generado para ${params.name}`,
      recipient: params.to,
      read: false,
    });

    return await this.emailService.sendVerificationEmail(params);
  }

  async sendPasswordResetEmail(params: {
    to: string;
    name: string;
    resetUrl: string;
  }) {
    await this.create({
      message: `Correo de recuperacion solicitado para ${params.name}`,
      recipient: params.to,
      read: false,
    });

    return await this.emailService.sendPasswordResetEmail(params);
  }

  async sendPasswordChangeConfirmEmail(params: {
    to: string;
    name: string;
    changeUrl: string;
  }) {
    await this.create({
      message: `Confirmacion de cambio de contrasena solicitada para ${params.name}`,
      recipient: params.to,
      read: false,
    });

    return await this.emailService.sendPasswordChangeConfirmEmail(params);
  }

  async getTicketCampaignOptions(options?: TicketCampaignOptionsFilter): Promise<TicketCampaignOption[]> {
    const organizerFilter = this.normalizeOrganizerFilter(options);
    const includeInactive = this.isTruthy(options?.includeInactive);
    try {
      const fromTicketing = await this.getTicketCampaignOptionsFromTicketingService(organizerFilter, includeInactive);
      if (fromTicketing.length > 0) {
        return fromTicketing;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo obtener tipos de ticket desde ticketing-service: ${reason}`);
    }

    return await this.getTicketCampaignOptionsFromDatabase(organizerFilter, includeInactive);
  }

  async getTicketCampaignAudience(
    ticketTypeId: string,
    options?: { includeAdmin?: boolean; organizerId?: string; organizerEmail?: string },
  ): Promise<TicketCampaignAudience> {
    const normalizedId = String(ticketTypeId || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('Debes seleccionar un ticket');
    }

    const includeAdmin = options?.includeAdmin === true;
    const organizerFilter = this.normalizeOrganizerFilter(options);

    await this.assertOrganizerAccessToTicketType(normalizedId, organizerFilter);

    try {
      return await this.getTicketCampaignAudienceFromTicketingService(normalizedId, includeAdmin);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo obtener audiencia desde ticketing-service: ${reason}`);
    }

    return await this.getTicketCampaignAudienceFromDatabase(normalizedId, includeAdmin, organizerFilter);
  }

  async sendTicketCampaign(params: {
    ticketTypeId: string;
    subject: string;
    message: string;
    senderName?: string;
    includeAdmin?: boolean | string;
    simulate?: boolean | string;
    testRecipients?: string[] | string;
    organizerId?: string;
    organizerEmail?: string;
  }) {
    const subject = String(params.subject || '').trim();
    const message = String(params.message || '').trim();
    const includeAdmin = this.isTruthy(params.includeAdmin);
    const simulate = this.isTruthy(params.simulate);
    const testRecipients = this.normalizeEmailList(params.testRecipients);

    if (!subject) {
      throw new BadRequestException('Debes escribir un asunto');
    }
    if (!message) {
      throw new BadRequestException('Debes escribir un mensaje');
    }

    const audience = await this.getTicketCampaignAudience(params.ticketTypeId, {
      includeAdmin,
      organizerId: params.organizerId,
      organizerEmail: params.organizerEmail,
    });
    if (!audience.recipients.length && !testRecipients.length) {
      throw new BadRequestException('No hay compradores elegibles para el ticket seleccionado');
    }

    const senderName = String(params.senderName || 'organizador').trim();
    const resolvedRecipients = this.buildResolvedRecipients(audience, testRecipients);
    const result = {
      deliveryMode: simulate ? 'simulation' : testRecipients.length ? 'test' : 'live',
      simulated: simulate,
      includeAdmin,
      usedTestRecipients: testRecipients,
      ticketType: audience.ticketType,
      source: audience.source,
      totalAudienceRecipients: audience.totalRecipients,
      totalResolvedRecipients: resolvedRecipients.length,
      totalOrders: audience.totalOrders,
      totalTickets: audience.totalTickets,
      roleBreakdown: audience.roleBreakdown,
      notificationsSaved: 0,
      emailsSent: 0,
      emailFailures: [] as Array<{ email: string; reason?: string }>,
      previewRecipients: resolvedRecipients.slice(0, 20).map((recipient) => ({
        email: recipient.email,
        name: recipient.name,
        accountType: recipient.accountType,
        deliverySource: recipient.deliverySource,
      })),
    };

    if (simulate) {
      return result;
    }

    for (const recipient of resolvedRecipients) {
      await this.create({
        message: this.buildTicketCampaignNotificationMessage(subject, message, audience.ticketType.name),
        recipient: recipient.email,
        read: false,
      });
      result.notificationsSaved += 1;

      const mail = await this.emailService.sendTicketCampaignEmail({
        to: recipient.email,
        recipientName: recipient.name,
        organizerName: senderName,
        subject,
        message,
        ticketTypeName: audience.ticketType.name,
      });

      if (mail.sent) {
        result.emailsSent += 1;
      } else {
        result.emailFailures.push({ email: recipient.email, reason: mail.reason });
      }
    }

    return result;
  }

  async ingestTicketPurchased(payload: any) {
    const normalized = this.normalizePurchasePayload(payload);
    const result = {
      participantNotificationSaved: false,
      participantEmailSent: false,
      participantEmailReason: undefined as string | undefined,
      organizersNotified: 0,
      organizerEmailsSent: 0,
      organizerEmailFailures: [] as Array<{ email: string; reason?: string }>,
    };

    if (normalized.recipientEmail) {
      await this.create({
        message: this.buildPurchaseMessage(normalized),
        recipient: normalized.recipientEmail,
        read: false,
      });
      result.participantNotificationSaved = true;

      const participantMail = await this.emailService.sendPurchaseConfirmation({
        to: normalized.recipientEmail,
        orderId: normalized.orderId,
        ticketTypeName: normalized.ticketTypeName,
        quantity: normalized.quantity,
        amount: normalized.amount,
      });
      result.participantEmailSent = participantMail.sent;
      result.participantEmailReason = participantMail.reason;
    }

    const organizers = await this.resolveOrganizerRecipients(normalized);
    if (!organizers.length) {
      this.logger.warn('No se encontro organizador para la venta; se omitio la notificacion interna.');
      return result;
    }

    for (const organizer of organizers) {
      await this.create({
        message: this.buildOrganizerSaleMessage(normalized),
        recipient: organizer.email,
        read: false,
      });

      result.organizersNotified += 1;
      const mail = await this.emailService.sendOrganizerSaleAlert({
        to: organizer.email,
        organizerName: organizer.name,
        orderId: normalized.orderId,
        ticketTypeName: normalized.ticketTypeName,
        quantity: normalized.quantity,
        amount: normalized.amount,
        buyerEmail: normalized.recipientEmail,
      });
      if (mail.sent) {
        result.organizerEmailsSent += 1;
      } else {
        result.organizerEmailFailures.push({ email: organizer.email, reason: mail.reason });
      }
    }

    return result;
  }

  private async getTicketCampaignOptionsFromTicketingService(
    organizer?: OrganizerFilter,
    includeInactive = false,
  ): Promise<TicketCampaignOption[]> {
    const url = new URL('/tickets/types', this.getTicketingServiceBaseUrl());
    url.searchParams.set('includeInactive', includeInactive ? 'true' : 'false');
    if (organizer?.organizerId) {
      url.searchParams.set('organizerId', organizer.organizerId);
    }
    if (organizer?.organizerEmail) {
      url.searchParams.set('organizerEmail', organizer.organizerEmail);
    }
    const response = await fetch(url.toString(), { headers: buildInternalServiceHeaders() });
    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(`ticketing-service respondio ${response.status}`);
    }

    const items = Array.isArray(payload) ? payload : [];
    return items.map((item) => this.normalizeTicketCampaignOption(item as Record<string, unknown>));
  }

  private async getTicketCampaignOptionsFromDatabase(
    organizer?: OrganizerFilter,
    includeInactive = false,
  ): Promise<TicketCampaignOption[]> {
    const filters: string[] = [];
    const params: Array<string> = [];

    if (organizer?.organizerId) {
      params.push(organizer.organizerId);
      filters.push(`organizer_id = $${params.length}`);
    }
    if (organizer?.organizerEmail) {
      params.push(organizer.organizerEmail);
      filters.push(`LOWER(organizer_email) = $${params.length}`);
    }
    if (!includeInactive) {
      filters.push('is_active = TRUE');
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          name,
          price,
          quantity,
          quantity_sold AS "quantitySold",
          event_id AS "eventId",
          organizer_id AS "organizerId",
          organizer_name AS "organizerName",
          organizer_email AS "organizerEmail",
          category,
          is_active AS "isActive"
        FROM ticket_types
        ${whereClause}
        ORDER BY created_at DESC
      `,
      params,
    );

    return (rows as Array<Record<string, unknown>>).map((row) => this.normalizeTicketCampaignOption(row));
  }

  private async getTicketCampaignAudienceFromTicketingService(
    ticketTypeId: string,
    includeAdmin: boolean,
  ): Promise<TicketCampaignAudience> {
    const query = includeAdmin ? '?includeAdmin=true' : '';
    const response = await fetch(`${this.getTicketingServiceBaseUrl()}/tickets/types/${ticketTypeId}/audience${query}`, {
      headers: buildInternalServiceHeaders(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((payload as { message?: string }).message || `ticketing-service respondio ${response.status}`);
    }

    return payload as TicketCampaignAudience;
  }

  private async getTicketCampaignAudienceFromDatabase(
    ticketTypeId: string,
    includeAdmin: boolean,
    organizer?: OrganizerFilter,
  ): Promise<TicketCampaignAudience> {
    const filters: string[] = ['id = $1'];
    const params: Array<string> = [ticketTypeId];

    if (organizer?.organizerId) {
      params.push(organizer.organizerId);
      filters.push(`organizer_id = $${params.length}`);
    }
    if (organizer?.organizerEmail) {
      params.push(organizer.organizerEmail);
      filters.push(`LOWER(organizer_email) = $${params.length}`);
    }

    const [ticketTypeRow] = (await this.dataSource.query(
      `
        SELECT
          id,
          name,
          price,
          quantity,
          quantity_sold AS "quantitySold",
          event_id AS "eventId",
          organizer_id AS "organizerId",
          organizer_name AS "organizerName",
          organizer_email AS "organizerEmail",
          category,
          is_active AS "isActive"
        FROM ticket_types
        WHERE ${filters.join(' AND ')}
      `,
      params,
    )) as Array<Record<string, unknown>>;

    if (!ticketTypeRow) {
      throw new NotFoundException('Ticket no encontrado');
    }

    const allowedRolesSql = includeAdmin
      ? "'standard', 'guest', 'admin'"
      : "'standard', 'guest'";

    const rows = (await this.dataSource.query(
      `
        SELECT
          MIN(u.id::text) AS "userId",
          COALESCE(NULLIF(TRIM(MIN(u.name)), ''), SPLIT_PART(LOWER(TRIM(o.recipient_email)), '@', 1), 'comprador') AS name,
          LOWER(TRIM(o.recipient_email)) AS email,
          LOWER(COALESCE(MIN(u.account_type), 'guest')) AS "accountType",
          COUNT(*)::int AS "totalOrders",
          COALESCE(SUM(o.quantity), 0)::int AS "totalTickets",
          MAX(o.created_at)::text AS "lastPurchaseAt"
        FROM orders o
        LEFT JOIN users u ON u.id::text = o.user_id
        WHERE o.ticket_type_id = $1
          AND TRIM(COALESCE(o.recipient_email, '')) <> ''
          AND LOWER(COALESCE(u.account_type, 'guest')) IN (${allowedRolesSql})
          AND LOWER(COALESCE(o.status, 'paid')) IN ('paid', 'succeeded', 'approved')
        GROUP BY LOWER(TRIM(o.recipient_email))
        ORDER BY MAX(o.created_at) DESC, LOWER(TRIM(o.recipient_email)) ASC
      `,
      [ticketTypeId],
    )) as TicketCampaignAudienceRow[];

    const recipients = rows.map((row) => ({
      userId: row.userId,
      name: String(row.name || 'comprador').trim(),
      email: String(row.email || '').trim().toLowerCase(),
      accountType: String(row.accountType || 'guest').trim().toLowerCase(),
      totalOrders: Number(row.totalOrders || 0),
      totalTickets: Number(row.totalTickets || 0),
      lastPurchaseAt: row.lastPurchaseAt,
    }));

    const roleBreakdown = this.buildRoleBreakdown(recipients);

    return {
      ticketType: this.normalizeTicketCampaignOption(ticketTypeRow),
      recipients,
      totalRecipients: recipients.length,
      totalOrders: recipients.reduce((sum, recipient) => sum + recipient.totalOrders, 0),
      totalTickets: recipients.reduce((sum, recipient) => sum + recipient.totalTickets, 0),
      roleBreakdown,
      source: 'database-fallback',
    };
  }

  private normalizeTicketCampaignOption(raw: Record<string, unknown>): TicketCampaignOption {
    return {
      id: String(raw.id || ''),
      name: String(raw.name || 'Ticket'),
      eventId: raw.eventId ? String(raw.eventId) : null,
      organizerId: raw.organizerId ? String(raw.organizerId) : null,
      organizerName: raw.organizerName ? String(raw.organizerName) : null,
      organizerEmail: raw.organizerEmail ? String(raw.organizerEmail) : null,
      category: raw.category ? String(raw.category) : null,
      price: Number(raw.price || 0),
      quantity: Number(raw.quantity || 0),
      quantitySold: Number(raw.quantitySold || 0),
      isActive: Boolean(raw.isActive),
    };
  }

  private buildPurchaseMessage(payload: any) {
    const ticketTypeName = payload.ticketTypeName || 'ticket';
    const quantity = Number(payload.quantity || 1);
    const amount = Number(payload.amount || 0).toFixed(2);
    return `Compra confirmada de ${quantity} ${ticketTypeName}. Orden ${payload.orderId}. Total $${amount}`;
  }

  private buildOrganizerSaleMessage(payload: any) {
    const ticketTypeName = payload.ticketTypeName || 'ticket';
    const quantity = Number(payload.quantity || 1);
    return `Nueva venta registrada: ${quantity} ${ticketTypeName}. Orden ${payload.orderId}. Comprador ${payload.recipientEmail || 'sin correo'}.`;
  }

  private buildTicketCampaignNotificationMessage(
    subject: string,
    message: string,
    ticketTypeName: string,
  ) {
    const compactMessage = message.replace(/\s+/g, ' ').trim();
    return `${subject} | Ticket ${ticketTypeName} | ${compactMessage}`;
  }

  private normalizePurchasePayload(payload: any) {
    return {
      orderId: String(payload?.orderId || payload?.id || 'sin-orden'),
      ticketTypeName: String(payload?.ticketTypeName || payload?.title || 'ticket'),
      organizerId: String(payload?.organizerId || '').trim(),
      organizerName: String(payload?.organizerName || '').trim(),
      organizerEmail: String(payload?.organizerEmail || '').trim().toLowerCase(),
      quantity: Math.max(1, Number(payload?.quantity || 1)),
      amount: Number(payload?.amount || payload?.totalAmount || 0),
      recipientEmail: String(payload?.recipientEmail || '').trim().toLowerCase(),
    };
  }

  private normalizeOrganizerFilter(options?: OrganizerFilter | { organizerId?: string; organizerEmail?: string }) {
    const organizerId = String(options?.organizerId ?? '').trim();
    const organizerEmail = this.normalizeRecipientEmail(options?.organizerEmail ?? '');
    if (!organizerId && !organizerEmail) {
      return undefined;
    }
    return {
      organizerId: organizerId || undefined,
      organizerEmail: organizerEmail || undefined,
    } as OrganizerFilter;
  }

  private normalizeRecipientEmail(value: string) {
    return String(value || '').trim().toLowerCase();
  }

  private async assertOrganizerAccessToTicketType(ticketTypeId: string, organizer?: OrganizerFilter) {
    if (!organizer?.organizerId && !organizer?.organizerEmail) {
      return;
    }

    const options = await this.getTicketCampaignOptions(organizer);
    const allowed = options.some((option) => option.id === ticketTypeId);
    if (!allowed) {
      throw new ForbiddenException('No tienes acceso al ticket seleccionado');
    }
  }

  private async resolveOrganizerRecipients(payload: {
    organizerId?: string;
    organizerName?: string;
    organizerEmail?: string;
  }): Promise<OrganizerRecipient[]> {
    const organizerEmail = this.normalizeRecipientEmail(payload.organizerEmail ?? '');
    const organizerId = String(payload.organizerId || '').trim();

    if (organizerEmail) {
      return [{
        id: organizerId || 'organizer',
        name: String(payload.organizerName || 'organizador').trim() || 'organizador',
        email: organizerEmail,
      }];
    }

    if (!organizerId) {
      return [];
    }

    const rows = (await this.dataSource.query(
      `
        SELECT id, name, email
        FROM users
        WHERE id = $1
          AND LOWER(account_type) = $2
          AND TRIM(COALESCE(email, '')) <> ''
      `,
      [organizerId, 'admin'],
    )) as OrganizerRecipient[];

    return rows
      .map((row) => ({
        id: String(row.id || organizerId),
        name: String(row.name || 'organizador').trim() || 'organizador',
        email: this.normalizeRecipientEmail(String(row.email || '')),
      }))
      .filter((row) => row.email);
  }

  private isTruthy(value: unknown) {
    return ['true', '1', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
  }

  private normalizeEmailList(value: unknown): string[] {
    const seen = new Set<string>();
    const rawItems = Array.isArray(value) ? value : [value];
    const emails: string[] = [];

    for (const item of rawItems) {
      for (const part of String(item ?? '').split(/[\n,;]+/)) {
        const email = this.normalizeRecipientEmail(String(part || ''));
        if (!email || seen.has(email)) {
          continue;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          continue;
        }
        seen.add(email);
        emails.push(email);
      }
    }

    return emails;
  }

  private buildResolvedRecipients(
    audience: TicketCampaignAudience,
    testRecipients: string[],
  ): TicketCampaignResolvedRecipient[] {
    if (testRecipients.length) {
      return testRecipients.map((email) => ({
        userId: null,
        name: this.buildRecipientNameFromEmail(email),
        email,
        accountType: 'test',
        deliverySource: 'test',
      }));
    }

    return audience.recipients.map((recipient) => ({
      userId: recipient.userId,
      name: recipient.name,
      email: recipient.email,
      accountType: recipient.accountType,
      deliverySource: 'audience',
    }));
  }

  private buildRecipientNameFromEmail(email: string) {
    const localPart = String(email || '').split('@')[0] || 'destinatario';
    return localPart
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ') || 'Destinatario de prueba';
  }

  private buildRoleBreakdown(recipients: TicketCampaignAudienceRecipient[]) {
    return recipients.reduce(
      (acc, recipient) => {
        if (recipient.accountType === 'standard') {
          acc.standard += 1;
        } else if (recipient.accountType === 'admin') {
          acc.admin += 1;
        } else {
          acc.guest += 1;
        }
        return acc;
      },
      { standard: 0, guest: 0, admin: 0 },
    );
  }

  private async findOrganizerRecipients(): Promise<OrganizerRecipient[]> {
    const organizers = (await this.dataSource.query(
      `
        SELECT id, name, email
        FROM users
        WHERE LOWER(account_type) = $1
          AND TRIM(COALESCE(email, '')) <> ''
        ORDER BY name ASC
      `,
      ['admin'],
    )) as OrganizerRecipient[];

    const seen = new Set<string>();
    return organizers.filter((organizer) => {
      const email = String(organizer.email || '').trim().toLowerCase();
      if (!email || seen.has(email)) {
        return false;
      }
      seen.add(email);
      return true;
    });
  }

  async create(notification: Partial<Notification>): Promise<Notification> {
    const normalized = { ...notification };
    if (normalized.recipient) {
      normalized.recipient = this.normalizeRecipientEmail(String(normalized.recipient));
    }
    const newNotification = this.notificationRepository.create(normalized);
    return await this.notificationRepository.save(newNotification);
  }

  async findAll(limit = 50, recipient?: string): Promise<Notification[]> {
    const normalizedRecipient = this.normalizeRecipientEmail(recipient ?? '');
    return await this.notificationRepository.find({
      where: normalizedRecipient ? { recipient: normalizedRecipient } : undefined,
      take: Math.max(1, Math.min(limit, 100)),
      order: { id: 'DESC' },
    });
  }

  async countAll(): Promise<number> {
    return await this.notificationRepository.count();
  }

  async remove(id: string): Promise<Notification | null> {
    const existing = await this.notificationRepository.findOneBy({ id });
    if (!existing) {
      return null;
    }
    await this.notificationRepository.remove(existing);
    return existing;
  }
}