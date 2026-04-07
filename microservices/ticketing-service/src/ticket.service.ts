import { Injectable, BadRequestException, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order } from './order.entity';
import { Ticket } from './ticket.entity';
import { TicketType } from './ticket-type.entity';
import { PaymentService } from './payment.service';
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
  const normalized = { ...headers, 'x-forwarded-by': 'ticketing-service' };
  const internalApiKey = String(process.env.INTERNAL_API_KEY ?? '').trim();
  if (internalApiKey) {
    normalized['x-internal-api-key'] = internalApiKey;
  }
  return normalized;
}

type PurchaseInput = {
  userId: string;
  ticketTypeId?: string;
  quantity?: number;
  title?: string;
  description?: string;
  amount?: number;
  provider: 'stripe' | 'paypal';
  recipientEmail?: string;
  cardToken?: string;
};

type TicketAudienceRow = {
  userId: string | null;
  name: string;
  email: string;
  accountType: string;
  totalOrders: string | number;
  totalTickets: string | number;
  lastPurchaseAt: string | null;
};

const TICKETING_TABLE_COLUMNS = {
  tickets: [
    { legacyName: 'createdAt', columnName: 'created_at', definition: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  orders: [
    { legacyName: 'userId', columnName: 'user_id', definition: 'VARCHAR(120) NOT NULL DEFAULT \'\'' },
    { legacyName: 'ticketId', columnName: 'ticket_id', definition: 'UUID NULL' },
    { legacyName: 'ticketTypeId', columnName: 'ticket_type_id', definition: 'VARCHAR(120) NULL' },
    { legacyName: 'ticketTypeName', columnName: 'ticket_type_name', definition: 'VARCHAR(200) NULL' },
    { legacyName: null, columnName: 'quantity', definition: 'INT NOT NULL DEFAULT 1' },
    { legacyName: 'unitPrice', columnName: 'unit_price', definition: 'NUMERIC(14,2) NOT NULL DEFAULT 0' },
    { legacyName: 'totalAmount', columnName: 'total_amount', definition: 'NUMERIC(14,2) NOT NULL DEFAULT 0' },
    { legacyName: 'paymentIntentId', columnName: 'payment_intent_id', definition: 'VARCHAR(160) NOT NULL DEFAULT \'manual\'' },
    { legacyName: 'recipientEmail', columnName: 'recipient_email', definition: 'VARCHAR(255) NOT NULL DEFAULT \'attendee@example.com\'' },
    { legacyName: 'createdAt', columnName: 'created_at', definition: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
  ticket_types: [
    { legacyName: 'quantitySold', columnName: 'quantity_sold', definition: 'INT NOT NULL DEFAULT 0' },
    { legacyName: 'maxPerPerson', columnName: 'max_per_person', definition: 'INT NOT NULL DEFAULT 0' },
    { legacyName: 'eventId', columnName: 'event_id', definition: 'VARCHAR(120) NULL' },
    { legacyName: null, columnName: 'organizer_id', definition: 'VARCHAR(120) NULL' },
    { legacyName: null, columnName: 'organizer_name', definition: 'VARCHAR(200) NULL' },
    { legacyName: null, columnName: 'organizer_email', definition: 'VARCHAR(255) NULL' },
    { legacyName: 'isActive', columnName: 'is_active', definition: 'BOOLEAN NOT NULL DEFAULT TRUE' },
    { legacyName: 'archivedAt', columnName: 'archived_at', definition: 'TIMESTAMP NULL' },
    { legacyName: 'createdAt', columnName: 'created_at', definition: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { legacyName: 'updatedAt', columnName: 'updated_at', definition: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ],
} as const;

@Injectable()
export class TicketService implements OnModuleInit {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(TicketType)
    private readonly ticketTypeRepository: Repository<TicketType>,
    private readonly paymentService: PaymentService,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  async onModuleInit() {
    await this.ensureTicketingSchema();
  }

  private async ensureTicketingSchema() {
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status VARCHAR(40) NOT NULL DEFAULT 'paid',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(120) NOT NULL,
        ticket_id UUID NULL,
        ticket_type_id VARCHAR(120) NULL,
        ticket_type_name VARCHAR(200) NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        provider VARCHAR(40) NOT NULL DEFAULT 'manual',
        payment_intent_id VARCHAR(160) NOT NULL DEFAULT 'manual',
        status VARCHAR(40) NOT NULL DEFAULT 'paid',
        recipient_email VARCHAR(255) NOT NULL DEFAULT 'attendee@example.com',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ticket_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        price NUMERIC(14,2) NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        quantity_sold INT NOT NULL DEFAULT 0,
        max_per_person INT NOT NULL DEFAULT 0,
        event_id VARCHAR(120) NULL,
        category VARCHAR(120) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        archived_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const [tableName, columns] of Object.entries(TICKETING_TABLE_COLUMNS)) {
      for (const column of columns) {
        if (column.legacyName) {
          await this.renameLegacyColumnIfNeeded(tableName, column.legacyName, column.columnName);
        }
        await this.dataSource.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${column.columnName} ${column.definition}`);
      }
    }

    await this.dataSource.query(`
      UPDATE tickets
      SET
        description = COALESCE(description, ''),
        status = COALESCE(NULLIF(status, ''), 'paid'),
        created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
      WHERE description IS NULL
        OR status IS NULL
        OR status = ''
        OR created_at IS NULL
    `);

    await this.dataSource.query(`
      UPDATE orders
      SET
        quantity = COALESCE(quantity, 1),
        unit_price = COALESCE(unit_price, total_amount, 0),
        total_amount = COALESCE(total_amount, unit_price, 0),
        provider = COALESCE(NULLIF(provider, ''), 'manual'),
        payment_intent_id = COALESCE(NULLIF(payment_intent_id, ''), 'manual'),
        status = COALESCE(NULLIF(status, ''), 'paid'),
        recipient_email = COALESCE(NULLIF(recipient_email, ''), 'attendee@example.com'),
        created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
      WHERE quantity IS NULL
        OR unit_price IS NULL
        OR total_amount IS NULL
        OR provider IS NULL
        OR provider = ''
        OR payment_intent_id IS NULL
        OR payment_intent_id = ''
        OR status IS NULL
        OR status = ''
        OR recipient_email IS NULL
        OR recipient_email = ''
        OR created_at IS NULL
    `);

    await this.dataSource.query(`
      UPDATE ticket_types
      SET
        quantity_sold = COALESCE(quantity_sold, 0),
        max_per_person = COALESCE(max_per_person, 0),
        is_active = COALESCE(is_active, TRUE),
        created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
        updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
      WHERE quantity_sold IS NULL
        OR max_per_person IS NULL
        OR is_active IS NULL
        OR created_at IS NULL
        OR updated_at IS NULL
    `);

    this.logger.log('Verified ticketing tables schema');
  }

  private async renameLegacyColumnIfNeeded(tableName: string, legacyName: string, columnName: string) {
    await this.dataSource.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = '${tableName}'
            AND column_name = '${legacyName}'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = '${tableName}'
            AND column_name = '${columnName}'
        ) THEN
          EXECUTE 'ALTER TABLE ${tableName} RENAME COLUMN "${legacyName}" TO ${columnName}';
        END IF;
      END
      $$;
    `);
  }

  private getEventServiceBaseUrl() {
    return normalizeServiceBaseUrl(process.env.EVENT_SERVICE_URL, 'http://localhost:3001');
  }

  private async getEventSnapshot(eventId: string, cache?: Map<string, any>) {
    if (!eventId) {
      return null;
    }
    if (cache?.has(eventId)) {
      return cache.get(eventId);
    }

    try {
      const response = await fetch(`${this.getEventServiceBaseUrl()}/events/data/${eventId}`, {
        headers: buildInternalServiceHeaders(),
      });
      if (!response.ok) {
        cache?.set(eventId, null);
        return null;
      }
      const payload = await response.json();
      cache?.set(eventId, payload);
      return payload;
    } catch {
      cache?.set(eventId, null);
      return null;
    }
  }

  private async archiveTicketTypeForFinishedEvent(ticketType: TicketType, cache: Map<string, any>) {
    if (!ticketType.eventId || ticketType.isActive === false) {
      return false;
    }

    const event = await this.getEventSnapshot(ticketType.eventId, cache);
    if (!event) {
      return false;
    }

    const status = String(event.status || '').toLowerCase();
    if (status !== 'finished' && event.isArchived !== true) {
      return false;
    }

    ticketType.isActive = false;
    ticketType.archivedAt = ticketType.archivedAt ?? new Date();
    await this.ticketTypeRepository.save(ticketType);
    return true;
  }

  private async syncTicketTypeArchiveState(ticketTypes: TicketType[]) {
    const cache = new Map<string, any>();
    let changed = false;
    for (const ticketType of ticketTypes) {
      const archived = await this.archiveTicketTypeForFinishedEvent(ticketType, cache);
      changed = changed || archived;
    }
    return changed;
  }

  private shouldUseCredentialHttpSync(queuePublished: boolean) {
    const force = String(process.env.CREDENTIAL_DIRECT_SYNC ?? '')
      .trim()
      .toLowerCase();
    return !queuePublished || force === 'true' || force === '1' || force === 'yes';
  }

  private shouldUseNotificationHttpSync(queuePublished: boolean) {
    const force = String(process.env.NOTIFICATION_DIRECT_SYNC ?? '')
      .trim()
      .toLowerCase();
    return !queuePublished || force === 'true' || force === '1' || force === 'yes';
  }

  private async syncCredentialDirectly(event: Record<string, unknown>) {
    const baseUrl = normalizeServiceBaseUrl(process.env.CREDENTIAL_SERVICE_URL, 'http://localhost:3004');

    try {
      const response = await fetch(`${baseUrl}/credentials/events/ticket-purchased`, {
        method: 'POST',
        headers: buildInternalServiceHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(event),
      });

      const payload = await response.json().catch(async () => {
        const text = await response.text().catch(() => '');
        return { message: text };
      });

      if (!response.ok) {
        return {
          attempted: true,
          ok: false,
          mode: 'http-fallback',
          reason: (payload as any).message || `Credential service respondio ${response.status}`,
        };
      }

      return {
        attempted: true,
        ok: true,
        mode: 'http-fallback',
        response: payload,
      };
    } catch (error) {
      return {
        attempted: true,
        ok: false,
        mode: 'http-fallback',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async syncNotificationDirectly(event: Record<string, unknown>) {
    const baseUrl = normalizeServiceBaseUrl(process.env.NOTIFICATION_SERVICE_URL, 'http://localhost:3003');

    try {
      const response = await fetch(`${baseUrl}/notifications/events/ticket-purchased`, {
        method: 'POST',
        headers: buildInternalServiceHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(event),
      });

      const payload = await response.json().catch(async () => {
        const text = await response.text().catch(() => '');
        return { message: text };
      });

      if (!response.ok) {
        return {
          attempted: true,
          ok: false,
          mode: 'http-fallback',
          reason: (payload as any).message || `Notification service respondio ${response.status}`,
        };
      }

      return {
        attempted: true,
        ok: true,
        mode: 'http-fallback',
        response: payload,
      };
    } catch (error) {
      return {
        attempted: true,
        ok: false,
        mode: 'http-fallback',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async create(ticket: Partial<Ticket>): Promise<Ticket> {
    const newTicket = this.ticketRepository.create(ticket);
    return await this.ticketRepository.save(newTicket);
  }

  async findAll(limit = 50): Promise<Ticket[]> {
    return await this.ticketRepository.find({
      take: Math.max(1, Math.min(limit, 100)),
      order: { createdAt: 'DESC' },
    });
  }

  async countAll(): Promise<number> {
    return await this.ticketRepository.count();
  }

  async remove(id: string): Promise<Ticket | null> {
    const existing = await this.ticketRepository.findOneBy({ id });
    if (!existing) {
      return null;
    }
    await this.ticketRepository.remove(existing);
    return existing;
  }

  async getTicketTypes(
    eventId?: string,
    includeInactive = false,
    organizer?: { id?: string; email?: string },
  ): Promise<TicketType[]> {
    const query = this.ticketTypeRepository.createQueryBuilder('tt');
    if (eventId) {
      query.where('tt.eventId = :eventId', { eventId });
    }
    if (organizer?.id) {
      query.andWhere('tt.organizerId = :organizerId', { organizerId: organizer.id });
    }
    if (organizer?.email) {
      query.andWhere('LOWER(tt.organizerEmail) = :organizerEmail', {
        organizerEmail: organizer.email.toLowerCase(),
      });
    }
    if (!includeInactive) {
      query.andWhere('tt.isActive = :isActive', { isActive: true });
    }
    let ticketTypes = await query.orderBy('tt.createdAt', 'DESC').getMany();
    const changed = await this.syncTicketTypeArchiveState(ticketTypes);
    if (!changed) {
      if (organizer && !ticketTypes.length) {
        const backfilled = await this.backfillOrganizerForUnassignedTypes(organizer);
        if (backfilled) {
          const refreshedQuery = this.ticketTypeRepository.createQueryBuilder('tt');
          if (eventId) {
            refreshedQuery.where('tt.eventId = :eventId', { eventId });
          }
          if (organizer?.id) {
            refreshedQuery.andWhere('tt.organizerId = :organizerId', { organizerId: organizer.id });
          }
          if (organizer?.email) {
            refreshedQuery.andWhere('LOWER(tt.organizerEmail) = :organizerEmail', {
              organizerEmail: organizer.email.toLowerCase(),
            });
          }
          if (!includeInactive) {
            refreshedQuery.andWhere('tt.isActive = :isActive', { isActive: true });
          }
          return await refreshedQuery.orderBy('tt.createdAt', 'DESC').getMany();
        }
      }

      return ticketTypes;
    }

    const refreshedQuery = this.ticketTypeRepository.createQueryBuilder('tt');
    if (eventId) {
      refreshedQuery.where('tt.eventId = :eventId', { eventId });
    }
    if (organizer?.id) {
      refreshedQuery.andWhere('tt.organizerId = :organizerId', { organizerId: organizer.id });
    }
    if (organizer?.email) {
      refreshedQuery.andWhere('LOWER(tt.organizerEmail) = :organizerEmail', {
        organizerEmail: organizer.email.toLowerCase(),
      });
    }
    if (!includeInactive) {
      refreshedQuery.andWhere('tt.isActive = :isActive', { isActive: true });
    }
    ticketTypes = await refreshedQuery.orderBy('tt.createdAt', 'DESC').getMany();

    if (organizer && !ticketTypes.length) {
      const backfilled = await this.backfillOrganizerForUnassignedTypes(organizer);
      if (backfilled) {
        const retryQuery = this.ticketTypeRepository.createQueryBuilder('tt');
        if (eventId) {
          retryQuery.where('tt.eventId = :eventId', { eventId });
        }
        if (organizer?.id) {
          retryQuery.andWhere('tt.organizerId = :organizerId', { organizerId: organizer.id });
        }
        if (organizer?.email) {
          retryQuery.andWhere('LOWER(tt.organizerEmail) = :organizerEmail', {
            organizerEmail: organizer.email.toLowerCase(),
          });
        }
        if (!includeInactive) {
          retryQuery.andWhere('tt.isActive = :isActive', { isActive: true });
        }
        return await retryQuery.orderBy('tt.createdAt', 'DESC').getMany();
      }
    }

    return ticketTypes;
  }

  private async backfillOrganizerForUnassignedTypes(organizer: { id?: string; email?: string }) {
    const organizerId = String(organizer?.id || '').trim();
    const organizerEmail = String(organizer?.email || '').trim().toLowerCase();
    if (!organizerId && !organizerEmail) {
      return 0;
    }

    const updatePayload: Partial<TicketType> = {};
    if (organizerId) {
      updatePayload.organizerId = organizerId;
    }
    if (organizerEmail) {
      updatePayload.organizerEmail = organizerEmail;
    }

    const result = await this.ticketTypeRepository
      .createQueryBuilder()
      .update(TicketType)
      .set(updatePayload)
      .where('organizer_id IS NULL AND organizer_email IS NULL')
      .execute();

    return Number(result.affected || 0);
  }

  async createTicketType(data: {
    name: string;
    price: number;
    quantity: number;
    eventId?: string;
    category?: string;
    maxPerPerson?: number;
    organizerId?: string;
    organizerName?: string;
    organizerEmail?: string;
  }): Promise<TicketType> {
    const name = (data.name || '').trim();
    const price = Number(data.price ?? 0);
    const quantity = Number(data.quantity ?? 0);
    if (!name) {
      throw new BadRequestException('Ticket type name is required');
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestException('Price must be greater than 0');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive integer');
    }
    const maxPerPerson = Number(data.maxPerPerson ?? 0);
    if (!Number.isInteger(maxPerPerson) || maxPerPerson < 0) {
      throw new BadRequestException('maxPerPerson must be 0 or a positive integer');
    }

    const organizerId = String(data.organizerId || '').trim();
    const organizerName = String(data.organizerName || '').trim();
    const organizerEmail = String(data.organizerEmail || '').trim().toLowerCase();
    const ticketType = this.ticketTypeRepository.create(data);
    ticketType.name = name;
    ticketType.price = price;
    ticketType.quantity = quantity;
    ticketType.quantitySold = 0;
    ticketType.maxPerPerson = maxPerPerson;
    ticketType.isActive = true;
    ticketType.archivedAt = null;
    if (organizerId) {
      ticketType.organizerId = organizerId;
    }
    if (organizerName) {
      ticketType.organizerName = organizerName;
    }
    if (organizerEmail) {
      ticketType.organizerEmail = organizerEmail;
    }
    return await this.ticketTypeRepository.save(ticketType);
  }

  async updateTicketType(
    id: string,
    data: Partial<{
      name: string;
      price: number;
      quantity: number;
      category: string;
      maxPerPerson: number;
    }>,
  ): Promise<TicketType> {
    const ticketType = await this.ticketTypeRepository.findOneBy({ id });
    if (!ticketType) {
      throw new BadRequestException('Ticket type not found');
    }

    if (data.price !== undefined) {
      const price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new BadRequestException('Price must be greater than 0');
      }
      data.price = price;
    }

    if (data.quantity !== undefined) {
      const quantity = Number(data.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new BadRequestException('Quantity must be a positive integer');
      }
      if (quantity < ticketType.quantitySold) {
        throw new BadRequestException('Quantity cannot be less than sold quantity');
      }
      data.quantity = quantity;
    }

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) {
        throw new BadRequestException('Ticket type name is required');
      }
      data.name = name;
    }

    if (data.maxPerPerson !== undefined) {
      const maxPerPerson = Number(data.maxPerPerson);
      if (!Number.isInteger(maxPerPerson) || maxPerPerson < 0) {
        throw new BadRequestException('maxPerPerson must be 0 or a positive integer');
      }
      data.maxPerPerson = maxPerPerson;
    }

    if (ticketType.isActive === false) {
      ticketType.isActive = true;
      ticketType.archivedAt = null;
    }

    Object.assign(ticketType, data);
    return await this.ticketTypeRepository.save(ticketType);
  }

  async deleteTicketType(id: string): Promise<{
    ok: boolean;
    action: 'deleted' | 'archived' | 'noop';
    message: string;
  }> {
    const existing = await this.ticketTypeRepository.findOneBy({ id });
    if (!existing) {
      return {
        ok: false,
        action: 'noop',
        message: 'Ticket type not found',
      };
    }
    if (existing.quantitySold > 0) {
      if (!existing.isActive) {
        return {
          ok: true,
          action: 'noop',
          message: 'El tipo ya estaba archivado',
        };
      }

      existing.isActive = false;
      existing.archivedAt = new Date();
      await this.ticketTypeRepository.save(existing);

      return {
        ok: true,
        action: 'archived',
        message: 'El tipo tiene ventas, por eso se archivó en lugar de eliminarse',
      };
    }
    const result = await this.ticketTypeRepository.delete({ id });
    return {
      ok: result.affected > 0,
      action: result.affected ? 'deleted' : 'noop',
      message: result.affected ? 'Tipo eliminado correctamente' : 'No se pudo eliminar el tipo',
    };
  }

  async restoreTicketType(id: string): Promise<TicketType> {
    const existing = await this.ticketTypeRepository.findOneBy({ id });
    if (!existing) {
      throw new BadRequestException('Ticket type not found');
    }

    existing.isActive = true;
    existing.archivedAt = null;
    return await this.ticketTypeRepository.save(existing);
  }

  async getOrders(
    filters?: {
      userId?: string;
      email?: string;
    },
    limit = 50,
  ): Promise<Order[]> {
    const query = this.orderRepository.createQueryBuilder('o');
    const userId = String(filters?.userId || '').trim();
    const email = String(filters?.email || '').trim().toLowerCase();
    if (userId) {
      query.where('o.userId = :userId', { userId });
    }
    if (email) {
      query.andWhere('LOWER(o.recipientEmail) = :email', { email });
    }
    return await query
      .orderBy('o.createdAt', 'DESC')
      .take(Math.max(1, Math.min(limit, 100)))
      .getMany();
  }

  async getTicketTypeAudience(ticketTypeId: string): Promise<{
    ticketType: {
      id: string;
      name: string;
      eventId?: string | null;
      category?: string | null;
      price: number;
      quantity: number;
      quantitySold: number;
      isActive: boolean;
    };
    recipients: Array<{
      userId: string | null;
      name: string;
      email: string;
      accountType: string;
      totalOrders: number;
      totalTickets: number;
      lastPurchaseAt: string | null;
    }>;
    totalRecipients: number;
    totalOrders: number;
    totalTickets: number;
    roleBreakdown: {
      standard: number;
      guest: number;
      admin: number;
    };
    source: 'ticketing-service';
  }> {
    const includeAdmin = false;
    return await this.getTicketTypeAudienceWithOptions(ticketTypeId, includeAdmin);
  }

  async getTicketTypeAudienceWithOptions(ticketTypeId: string, includeAdmin: boolean): Promise<{
    ticketType: {
      id: string;
      name: string;
      eventId?: string | null;
      category?: string | null;
      price: number;
      quantity: number;
      quantitySold: number;
      isActive: boolean;
    };
    recipients: Array<{
      userId: string | null;
      name: string;
      email: string;
      accountType: string;
      totalOrders: number;
      totalTickets: number;
      lastPurchaseAt: string | null;
    }>;
    totalRecipients: number;
    totalOrders: number;
    totalTickets: number;
    roleBreakdown: {
      standard: number;
      guest: number;
      admin: number;
    };
    source: 'ticketing-service';
  }> {
    const normalizedId = String(ticketTypeId || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('ticketTypeId is required');
    }

    const ticketType = await this.ticketTypeRepository.findOneBy({ id: normalizedId });
    if (!ticketType) {
      throw new NotFoundException('Ticket type not found');
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
      [normalizedId],
    )) as TicketAudienceRow[];

    const recipients = rows.map((row) => ({
      userId: row.userId,
      name: String(row.name || 'comprador').trim(),
      email: String(row.email || '').trim().toLowerCase(),
      accountType: String(row.accountType || 'guest').trim().toLowerCase(),
      totalOrders: Number(row.totalOrders || 0),
      totalTickets: Number(row.totalTickets || 0),
      lastPurchaseAt: row.lastPurchaseAt,
    }));

    const roleBreakdown = recipients.reduce(
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

    return {
      ticketType: {
        id: ticketType.id,
        name: ticketType.name,
        eventId: ticketType.eventId ?? null,
        category: ticketType.category ?? null,
        price: Number(ticketType.price || 0),
        quantity: Number(ticketType.quantity || 0),
        quantitySold: Number(ticketType.quantitySold || 0),
        isActive: ticketType.isActive,
      },
      recipients,
      totalRecipients: recipients.length,
      totalOrders: recipients.reduce((sum, recipient) => sum + recipient.totalOrders, 0),
      totalTickets: recipients.reduce((sum, recipient) => sum + recipient.totalTickets, 0),
      roleBreakdown,
      source: 'ticketing-service',
    };
  }

  async getOrdersSummary(): Promise<{
    totalOrders: number;
    totalRevenue: number;
    totalTicketsSold: number;
    paidCount: number;
    pendingCount: number;
  }> {
    const totalOrders = await this.orderRepository.count();
    const result = await this.orderRepository
      .createQueryBuilder('o')
      .select('SUM(o.totalAmount)', 'totalRevenue')
      .addSelect('SUM(o.quantity)', 'totalTicketsSold')
      .addSelect(
        "COUNT(CASE WHEN LOWER(o.status) IN ('paid','succeeded','approved') THEN 1 END)",
        'paidCount',
      )
      .addSelect(
        "COUNT(CASE WHEN LOWER(o.status) IN ('pending','processing','requires_action') THEN 1 END)",
        'pendingCount',
      )
      .getRawOne();

    return {
      totalOrders,
      totalRevenue: parseFloat(result?.totalRevenue || '0'),
      totalTicketsSold: parseInt(result?.totalTicketsSold || '0', 10),
      paidCount: parseInt(result?.paidCount || '0'),
      pendingCount: parseInt(result?.pendingCount || '0'),
    };
  }

  async purchaseTicket(data: PurchaseInput) {
    const userId = (data.userId || '').trim();
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    const quantity = Math.max(1, Number(data.quantity ?? 1));
    if (!Number.isInteger(quantity)) {
      throw new BadRequestException('quantity must be an integer');
    }

    let ticketTypeId = data.ticketTypeId;
    let title = (data.title || '').trim();
    let description = (data.description || '').trim();
    let unitPrice = 0;
    let totalAmount = Number(data.amount ?? 0);

    if (ticketTypeId) {
      const ticketType = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(TicketType);
        const orderRepo = manager.getRepository(Order);
        const found = await repo
          .createQueryBuilder('tt')
          .setLock('pessimistic_write')
          .where('tt.id = :id', { id: ticketTypeId })
          .getOne();

        if (!found) {
          throw new NotFoundException('Ticket type not found');
        }

        const event = found.eventId ? await this.getEventSnapshot(found.eventId) : null;
        if (event && (String(event.status || '').toLowerCase() === 'finished' || event.isArchived === true)) {
          found.isActive = false;
          found.archivedAt = found.archivedAt ?? new Date();
          await repo.save(found);
          throw new BadRequestException('This ticket type belongs to an event that already finished');
        }

        if (!found.isActive) {
          throw new BadRequestException('Selected ticket type is archived');
        }

        const available = found.quantity - found.quantitySold;
        if (available < quantity) {
          throw new BadRequestException('Not enough stock for selected ticket type');
        }

        const maxPerPerson = Number(found.maxPerPerson || 0);
        if (maxPerPerson > 0) {
          const purchasedRaw = await orderRepo
            .createQueryBuilder('o')
            .select('SUM(o.quantity)', 'qty')
            .where('o.userId = :userId', { userId })
            .andWhere('o.ticketTypeId = :ticketTypeId', { ticketTypeId: found.id })
            .andWhere("LOWER(o.status) IN ('paid','succeeded','approved')")
            .getRawOne();
          const purchasedQty = Number(purchasedRaw?.qty || 0);
          if (purchasedQty + quantity > maxPerPerson) {
            throw new BadRequestException(
              `Purchase limit exceeded for this ticket type. Max per person: ${maxPerPerson}`,
            );
          }
        }

        unitPrice = Number(found.price);
        const expectedAmount = Number((unitPrice * quantity).toFixed(2));
        if (Number.isFinite(totalAmount) && totalAmount > 0 && Math.abs(totalAmount - expectedAmount) > 0.01) {
          throw new BadRequestException('Provided amount does not match ticket type price');
        }
        totalAmount = expectedAmount;
        title = `${found.name} x${quantity}`;
        description = description || `Compra de ${quantity} ticket(s) tipo ${found.name}`;

        // Reserva lógica de stock dentro de la transacción.
        found.quantitySold += quantity;
        await repo.save(found);
        return found;
      });

      const payment = await this.paymentService.charge({
        provider: data.provider,
        amount: totalAmount,
        customerEmail: data.recipientEmail,
        cardToken: data.cardToken,
      });

      if (!payment.ok) {
        // Compensación simple de stock en caso de fallo del pago.
        await this.ticketTypeRepository
          .createQueryBuilder()
          .update(TicketType)
          .set({ quantitySold: () => `GREATEST(0, quantity_sold - ${quantity})` })
          .where('id = :id', { id: ticketType.id })
          .execute();

        throw new BadRequestException(`Pago fallido: ${(payment as any).error ?? 'Razón desconocida'}`);
      }

      const ticket = await this.create({ title, description, status: 'paid' });
      const order = this.orderRepository.create({
        userId,
        ticketId: ticket.id,
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        quantity,
        unitPrice,
        totalAmount,
        provider: data.provider,
        paymentIntentId: (payment as any).paymentIntentId || (payment as any).transactionId,
        status: payment.status || 'paid',
        recipientEmail: data.recipientEmail ?? 'attendee@example.com',
      });
      const savedOrder = await this.orderRepository.save(order);

      const event = {
        eventType: 'ticket.purchased',
        occurredAt: new Date().toISOString(),
        orderId: savedOrder.id,
        orderItemId: ticket.id,
        userId,
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        organizerId: ticketType.organizerId ?? null,
        organizerName: ticketType.organizerName ?? null,
        organizerEmail: ticketType.organizerEmail ?? null,
        attendeeName: savedOrder.recipientEmail || userId,
        amount: totalAmount,
        unitPrice,
        quantity,
        recipientEmail: savedOrder.recipientEmail,
        paymentIntentId: savedOrder.paymentIntentId,
        paymentStatus: payment.status,
      };

      const queuePublished = await this.rabbitMqService.publish('ticket.purchased', event);
      const credentialSync = this.shouldUseCredentialHttpSync(queuePublished)
        ? await this.syncCredentialDirectly(event)
        : { attempted: false, ok: true, mode: 'queue' };
      const notificationSync = this.shouldUseNotificationHttpSync(queuePublished)
        ? await this.syncNotificationDirectly(event)
        : { attempted: false, ok: true, mode: 'queue' };
      return {
        ticket,
        order: savedOrder,
        payment,
        publishedEvent: event,
        queuePublished,
        credentialSync,
        notificationSync,
      };
    }

    if (!title) {
      throw new BadRequestException('title or ticketTypeId is required');
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }

    const payment = await this.paymentService.charge({
      provider: data.provider,
      amount: totalAmount,
      customerEmail: data.recipientEmail,
      cardToken: data.cardToken,
    });

    if (!payment.ok) {
      throw new BadRequestException(`Pago fallido: ${(payment as any).error ?? 'Razón desconocida'}`);
    }

    const ticket = await this.create({
      title,
      description: description || 'Ticket de compra libre',
      status: 'paid',
    });

    const order = this.orderRepository.create({
      userId,
      ticketId: ticket.id,
      quantity,
      unitPrice: totalAmount,
      totalAmount,
      provider: data.provider,
      paymentIntentId: (payment as any).paymentIntentId || (payment as any).transactionId,
      status: payment.status || 'paid',
      recipientEmail: data.recipientEmail ?? 'attendee@example.com',
    });
    const savedOrder = await this.orderRepository.save(order);

    const event = {
      eventType: 'ticket.purchased',
      occurredAt: new Date().toISOString(),
      orderId: savedOrder.id,
      orderItemId: ticket.id,
      userId,
      ticketTypeId: 'custom',
      organizerId: null,
      organizerName: null,
      organizerEmail: null,
      attendeeName: savedOrder.recipientEmail || userId,
      amount: totalAmount,
      quantity,
      recipientEmail: savedOrder.recipientEmail,
      paymentIntentId: savedOrder.paymentIntentId,
      paymentStatus: payment.status,
    };
    const queuePublished = await this.rabbitMqService.publish('ticket.purchased', event);
    const credentialSync = this.shouldUseCredentialHttpSync(queuePublished)
      ? await this.syncCredentialDirectly(event)
      : { attempted: false, ok: true, mode: 'queue' };
    const notificationSync = this.shouldUseNotificationHttpSync(queuePublished)
      ? await this.syncNotificationDirectly(event)
      : { attempted: false, ok: true, mode: 'queue' };
    return {
      ticket,
      order: savedOrder,
      payment,
      publishedEvent: event,
      queuePublished,
      credentialSync,
      notificationSync,
    };
  }
}
