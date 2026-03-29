import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
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

type OrganizerRecipient = {
  id: string;
  name: string;
  email: string;
};

type TicketCampaignOption = {
  id: string;
  name: string;
  eventId?: string | null;
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

  async getTicketCampaignOptions(): Promise<TicketCampaignOption[]> {
    try {
      const fromTicketing = await this.getTicketCampaignOptionsFromTicketingService();
      if (fromTicketing.length > 0) {
        return fromTicketing;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo obtener tipos de ticket desde ticketing-service: ${reason}`);
    }

    return await this.getTicketCampaignOptionsFromDatabase();
  }

  async getTicketCampaignAudience(
    ticketTypeId: string,
    options?: { includeAdmin?: boolean },
  ): Promise<TicketCampaignAudience> {
    const normalizedId = String(ticketTypeId || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('Debes seleccionar un ticket');
    }

    const includeAdmin = options?.includeAdmin === true;

    try {
      return await this.getTicketCampaignAudienceFromTicketingService(normalizedId, includeAdmin);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo obtener audiencia desde ticketing-service: ${reason}`);
    }

    return await this.getTicketCampaignAudienceFromDatabase(normalizedId, includeAdmin);
  }

  async sendTicketCampaign(params: {
    ticketTypeId: string;
    subject: string;
    message: string;
    senderName?: string;
    includeAdmin?: boolean | string;
    simulate?: boolean | string;
    testRecipients?: string[] | string;
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

    const audience = await this.getTicketCampaignAudience(params.ticketTypeId, { includeAdmin });
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

    const organizers = await this.findOrganizerRecipients();
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

  private async getTicketCampaignOptionsFromTicketingService(): Promise<TicketCampaignOption[]> {
    const response = await fetch(`${this.getTicketingServiceBaseUrl()}/tickets/types?includeInactive=true`);
    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(`ticketing-service respondio ${response.status}`);
    }

    const items = Array.isArray(payload) ? payload : [];
    return items.map((item) => this.normalizeTicketCampaignOption(item as Record<string, unknown>));
  }

  private async getTicketCampaignOptionsFromDatabase(): Promise<TicketCampaignOption[]> {
    const rows = await this.dataSource.query(
      `
        SELECT id, name, price, quantity, "quantitySold", "eventId", category, "isActive"
        FROM ticket_types
        ORDER BY "createdAt" DESC
      `,
    );

    return (rows as Array<Record<string, unknown>>).map((row) => this.normalizeTicketCampaignOption(row));
  }

  private async getTicketCampaignAudienceFromTicketingService(
    ticketTypeId: string,
    includeAdmin: boolean,
  ): Promise<TicketCampaignAudience> {
    const query = includeAdmin ? '?includeAdmin=true' : '';
    const response = await fetch(`${this.getTicketingServiceBaseUrl()}/tickets/types/${ticketTypeId}/audience${query}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((payload as { message?: string }).message || `ticketing-service respondio ${response.status}`);
    }

    return payload as TicketCampaignAudience;
  }

  private async getTicketCampaignAudienceFromDatabase(
    ticketTypeId: string,
    includeAdmin: boolean,
  ): Promise<TicketCampaignAudience> {
    const [ticketTypeRow] = (await this.dataSource.query(
      `
        SELECT id, name, price, quantity, "quantitySold", "eventId", category, "isActive"
        FROM ticket_types
        WHERE id = $1
      `,
      [ticketTypeId],
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
          COALESCE(NULLIF(TRIM(MIN(u.name)), ''), SPLIT_PART(LOWER(TRIM(o."recipientEmail")), '@', 1), 'comprador') AS name,
          LOWER(TRIM(o."recipientEmail")) AS email,
          LOWER(COALESCE(MIN(u."accountType"), 'guest')) AS "accountType",
          COUNT(*)::int AS "totalOrders",
          COALESCE(SUM(o.quantity), 0)::int AS "totalTickets",
          MAX(o."createdAt")::text AS "lastPurchaseAt"
        FROM orders o
        LEFT JOIN users u ON u.id::text = o."userId"
        WHERE o."ticketTypeId" = $1
          AND TRIM(COALESCE(o."recipientEmail", '')) <> ''
          AND LOWER(COALESCE(u."accountType", 'guest')) IN (${allowedRolesSql})
          AND LOWER(COALESCE(o.status, 'paid')) IN ('paid', 'succeeded', 'approved')
        GROUP BY LOWER(TRIM(o."recipientEmail"))
        ORDER BY MAX(o."createdAt") DESC, LOWER(TRIM(o."recipientEmail")) ASC
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
      quantity: Math.max(1, Number(payload?.quantity || 1)),
      amount: Number(payload?.amount || payload?.totalAmount || 0),
      recipientEmail: String(payload?.recipientEmail || '').trim().toLowerCase(),
    };
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
        const email = String(part || '').trim().toLowerCase();
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
        WHERE LOWER("accountType") = $1
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
    const newNotification = this.notificationRepository.create(notification);
    return await this.notificationRepository.save(newNotification);
  }

  async findAll(limit = 50): Promise<Notification[]> {
    return await this.notificationRepository.find({
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