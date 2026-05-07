import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Event } from './event.entity';

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
  const normalized: Record<string, string> = { ...headers, 'x-forwarded-by': 'event-service' };
  const internalApiKey = String(process.env.INTERNAL_API_KEY ?? '').trim();
  if (internalApiKey) {
    normalized['x-internal-api-key'] = internalApiKey;
  }
  return normalized;
}

function resolveInternalRequestTimeoutMs() {
  const fallback = process.env.NODE_ENV === 'production' ? 20000 : 8000;
  const configured = Number(process.env.INTERNAL_FETCH_TIMEOUT_MS ?? fallback);
  if (!Number.isFinite(configured)) {
    return fallback;
  }
  return Math.max(3000, Math.min(Math.trunc(configured), 60000));
}

function describeServiceRequestError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }

  return [error.name, error.message]
    .filter(Boolean)
    .join(': ');
}

function isRetryableServiceRequestError(error: unknown): boolean {
  const reason = describeServiceRequestError(error).toLowerCase();
  return (
    reason.includes('responded 401') ||
    reason.includes('responded 403') ||
    reason.includes('responded 404') ||
    reason.includes('responded 500') ||
    reason.includes('responded 502') ||
    reason.includes('responded 503') ||
    reason.includes('responded 504') ||
    reason.includes('failed to fetch') ||
    reason.includes('fetch failed') ||
    reason.includes('aborterror') ||
    reason.includes('aborted') ||
    reason.includes('timeout') ||
    reason.includes('timed out')
  );
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Weekday = (typeof WEEKDAYS)[number];
const DEFAULT_ACTIVE_WEEKDAYS = JSON.stringify(WEEKDAYS);

const EVENT_SCHEMA_COLUMNS = [
  { legacyName: 'endDate', columnName: 'end_date', definition: 'DATE NULL' },
  { legacyName: 'startTime', columnName: 'start_time', definition: "VARCHAR(5) NOT NULL DEFAULT '09:00'" },
  { legacyName: 'endTime', columnName: 'end_time', definition: "VARCHAR(5) NOT NULL DEFAULT '18:00'" },
  { legacyName: null, columnName: 'description', definition: 'TEXT NULL' },
  { legacyName: 'activeWeekdays', columnName: 'active_weekdays', definition: 'TEXT NULL' },
  { legacyName: null, columnName: 'organizer_id', definition: 'VARCHAR(120) NULL' },
  { legacyName: null, columnName: 'organizer_name', definition: 'VARCHAR(200) NULL' },
  { legacyName: null, columnName: 'organizer_email', definition: 'VARCHAR(255) NULL' },
  { legacyName: 'isArchived', columnName: 'is_archived', definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
  { legacyName: 'archivedAt', columnName: 'archived_at', definition: 'TIMESTAMP NULL' },
  { legacyName: 'createdAt', columnName: 'created_at', definition: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  { legacyName: 'updatedAt', columnName: 'updated_at', definition: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
] as const;

type EventInput = Partial<Event> & {
  startDate?: string | Date;
  endDate?: string | Date;
  startTime?: string;
  endTime?: string;
  description?: string | null;
  activeWeekdays?: string[] | null;
};

type EventViewerContext = {
  role: string;
  isAuthenticated: boolean;
  organizerId?: string;
  organizerName?: string;
  organizerEmail?: string;
};

type OwnedOrderSource = {
  ticketTypeId?: string | null;
  status?: string | null;
};

type TicketTypeSource = {
  id?: string | null;
  eventId?: string | null;
};

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);
  private readonly ticketingBaseUrl = normalizeServiceBaseUrl(process.env.TICKETING_SERVICE_URL, 'http://localhost:3002');
  private readonly gatewayBaseUrl = normalizeServiceBaseUrl(
    process.env.GATEWAY_BASE_URL ?? process.env.GATEWAY_URL,
    'http://localhost:3008',
  );

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.ensureEventSchema();
  }

  private async ensureEventSchema() {
    for (const column of EVENT_SCHEMA_COLUMNS) {
      if (column.legacyName) {
        await this.renameLegacyColumnIfNeeded(column.legacyName, column.columnName);
      }

      await this.dataSource.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ${column.columnName} ${column.definition}`);
    }

    await this.dataSource.query(`
      UPDATE events
      SET
        end_date = COALESCE(end_date, date::date),
        start_time = COALESCE(NULLIF(start_time, ''), '09:00'),
        end_time = COALESCE(NULLIF(end_time, ''), '18:00'),
        active_weekdays = COALESCE(NULLIF(active_weekdays, ''), '${DEFAULT_ACTIVE_WEEKDAYS}'),
        is_archived = COALESCE(is_archived, FALSE),
        created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
        updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
      WHERE end_date IS NULL
        OR start_time IS NULL
        OR start_time = ''
        OR end_time IS NULL
        OR end_time = ''
        OR active_weekdays IS NULL
        OR active_weekdays = ''
        OR is_archived IS NULL
        OR created_at IS NULL
        OR updated_at IS NULL
    `);

    this.logger.log('Verified events table schema');
  }

  private async renameLegacyColumnIfNeeded(legacyName: string, columnName: string) {
    await this.dataSource.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'events'
            AND column_name = '${legacyName}'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'events'
            AND column_name = '${columnName}'
        ) THEN
          EXECUTE 'ALTER TABLE events RENAME COLUMN "${legacyName}" TO ${columnName}';
        END IF;
      END
      $$;
    `);
  }

  private formatDateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  private normalizeDateInput(value: string | Date | undefined | null, fieldName: string): string {
    if (!value) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new BadRequestException(`${fieldName} is invalid`);
      }
      return this.formatDateOnly(value);
    }

    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new BadRequestException(`${fieldName} must use YYYY-MM-DD format`);
    }
    return text;
  }

  private normalizeTimeInput(value: string | undefined | null, fieldName: string, fallback: string): string {
    const text = String(value ?? fallback).trim();
    if (!/^\d{2}:\d{2}$/.test(text)) {
      throw new BadRequestException(`${fieldName} must use HH:mm format`);
    }

    const [hours, minutes] = text.split(':').map((part) => Number(part));
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return text;
  }

  private normalizeWeekdays(values?: string[] | null): Weekday[] {
    const unique = new Set<Weekday>();
    for (const value of Array.isArray(values) ? values : []) {
      const normalized = String(value || '').trim().toLowerCase() as Weekday;
      if (WEEKDAYS.includes(normalized)) {
        unique.add(normalized);
      }
    }

    if (unique.size === 0) {
      return [...WEEKDAYS];
    }

    return WEEKDAYS.filter((weekday) => unique.has(weekday));
  }

  private combineDateTime(dateValue: string, timeValue: string): Date {
    const [year, month, day] = dateValue.split('-').map((part) => Number(part));
    const [hours, minutes] = timeValue.split(':').map((part) => Number(part));
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  private weekdayName(date: Date): Weekday {
    return WEEKDAYS[(date.getDay() + 6) % 7];
  }

  private findOccurrenceDate(startDate: string, endDate: string, weekdays: Weekday[], direction: 'forward' | 'backward'): string {
    const weekdaySet = new Set(weekdays);
    let cursor = this.parseDateOnly(direction === 'forward' ? startDate : endDate);
    const boundary = this.parseDateOnly(direction === 'forward' ? endDate : startDate);

    while ((direction === 'forward' && cursor <= boundary) || (direction === 'backward' && cursor >= boundary)) {
      if (weekdaySet.has(this.weekdayName(cursor))) {
        return this.formatDateOnly(cursor);
      }
      cursor.setDate(cursor.getDate() + (direction === 'forward' ? 1 : -1));
    }

    return direction === 'forward' ? startDate : endDate;
  }

  private resolveSchedule(event: Event) {
    const startDate = this.normalizeDateInput(event.date, 'date');
    const endDate = this.normalizeDateInput(event.endDate ?? startDate, 'endDate');
    const startTime = this.normalizeTimeInput(event.startTime, 'startTime', '09:00');
    const endTime = this.normalizeTimeInput(event.endTime, 'endTime', '18:00');
    const weekdays = this.normalizeWeekdays(event.activeWeekdays);

    const firstOccurrenceDate = this.findOccurrenceDate(startDate, endDate, weekdays, 'forward');
    const lastOccurrenceDate = this.findOccurrenceDate(startDate, endDate, weekdays, 'backward');
    const firstStartAt = this.combineDateTime(firstOccurrenceDate, startTime);
    const finalEndAt = this.combineDateTime(lastOccurrenceDate, endTime);
    const now = new Date();

    let status: 'upcoming' | 'active' | 'finished' = 'upcoming';
    if (now >= finalEndAt) {
      status = 'finished';
    } else if (now >= firstStartAt) {
      status = 'active';
    }

    return {
      startDate,
      endDate,
      startTime,
      endTime,
      weekdays,
      firstStartAt,
      finalEndAt,
      status,
      durationDays:
        Math.floor(
          (this.parseDateOnly(endDate).getTime() - this.parseDateOnly(startDate).getTime()) / (24 * 60 * 60 * 1000),
        ) + 1,
    };
  }

  private async archiveFinishedEventIfNeeded(event: Event): Promise<Event> {
    const schedule = this.resolveSchedule(event);
    if (!event.isArchived && schedule.status === 'finished') {
      event.isArchived = true;
      event.archivedAt = new Date();
      return await this.eventRepository.save(event);
    }
    return event;
  }

  private normalizeRole(role?: string): string {
    const normalized = String(role ?? 'guest').trim().toLowerCase();
    if (normalized === 'standar') {
      return 'standard';
    }
    if (normalized === 'invitado') {
      return 'guest';
    }
    return normalized;
  }

  private resolveViewerContext(authorization?: string): EventViewerContext {
    const normalizedAuthorization = String(authorization ?? '').trim();
    if (!normalizedAuthorization.startsWith('Bearer ')) {
      return { role: 'guest', isAuthenticated: false };
    }

    const token = normalizedAuthorization.slice('Bearer '.length);
    const secret = process.env.JWT_SECRET ?? 'dev_only_change_me';

    try {
      const decoded = this.jwtService.verify(token, { secret }) as {
        accountType?: unknown;
        role?: unknown;
        sub?: unknown;
        id?: unknown;
        name?: unknown;
        email?: unknown;
      };
      const organizerId = String(decoded?.sub ?? decoded?.id ?? '').trim();
      const organizerName = String(decoded?.name ?? '').trim();
      const organizerEmail = String(decoded?.email ?? '').trim().toLowerCase();
      return {
        role: this.normalizeRole(String(decoded?.accountType ?? decoded?.role ?? 'guest')),
        isAuthenticated: true,
        organizerId: organizerId || undefined,
        organizerName: organizerName || undefined,
        organizerEmail: organizerEmail || undefined,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'token invalido';
      this.logger.warn(`Ignoring event viewer token: ${reason}`);
      return { role: 'guest', isAuthenticated: false };
    }
  }

  private async requestTicketingArray<T>(baseUrl: string, path: string, authorization?: string): Promise<T[]> {
    const url = new URL(path, baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), resolveInternalRequestTimeoutMs());

    try {
      const headers = buildInternalServiceHeaders({ Accept: 'application/json' });
      if (authorization) {
        headers.Authorization = authorization;
      }

      const response = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`${baseUrl} responded ${response.status}`);
      }

      const payload = await response.json().catch(() => []);
      return Array.isArray(payload) ? (payload as T[]) : [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchOwnedOrders(authorization: string): Promise<OwnedOrderSource[]> {
    try {
      return await this.requestTicketingArray<OwnedOrderSource>(this.ticketingBaseUrl, '/tickets/orders?limit=100', authorization);
    } catch (error) {
      const reason = describeServiceRequestError(error);
      const canRetryThroughGateway =
        this.gatewayBaseUrl !== this.ticketingBaseUrl &&
        isRetryableServiceRequestError(error);

      if (canRetryThroughGateway) {
        this.logger.warn(`Falling back to api-gateway for owned event orders after direct ticketing-service failure: ${reason}`);
        return await this.requestTicketingArray<OwnedOrderSource>(this.gatewayBaseUrl, '/tickets/orders?limit=100', authorization);
      }

      this.logger.error(`Unable to fetch owned event orders: ${reason}`);
      throw new ServiceUnavailableException('No se pudieron consultar las compras del usuario');
    }
  }

  private async fetchTicketTypeSources(): Promise<TicketTypeSource[]> {
    try {
      return await this.requestTicketingArray<TicketTypeSource>(this.ticketingBaseUrl, '/tickets/types?includeInactive=true');
    } catch (error) {
      const reason = describeServiceRequestError(error);
      const canRetryThroughGateway =
        this.gatewayBaseUrl !== this.ticketingBaseUrl &&
        isRetryableServiceRequestError(error);

      if (canRetryThroughGateway) {
        this.logger.warn(`Falling back to api-gateway for ticket types used in event ownership after direct ticketing-service failure: ${reason}`);
        return await this.requestTicketingArray<TicketTypeSource>(this.gatewayBaseUrl, '/tickets/types?includeInactive=true');
      }

      this.logger.error(`Unable to fetch ticket types for event ownership: ${reason}`);
      throw new ServiceUnavailableException('No se pudieron resolver los eventos de los tickets del usuario');
    }
  }

  private async getOwnedPurchasedEventIds(authorization: string): Promise<Set<string>> {
    const normalizedAuthorization = String(authorization ?? '').trim();
    if (!normalizedAuthorization.startsWith('Bearer ')) {
      return new Set<string>();
    }

    const orders = await this.fetchOwnedOrders(normalizedAuthorization);
    const purchasedTicketTypeIds = [...new Set(
      orders
        .filter((order) => {
          const status = String(order?.status ?? 'paid').trim().toLowerCase();
          return status === '' || status === 'paid' || status === 'succeeded' || status === 'approved';
        })
        .map((order) => String(order?.ticketTypeId ?? '').trim())
        .filter(Boolean),
    )];

    if (purchasedTicketTypeIds.length === 0) {
      return new Set<string>();
    }

    const ticketTypes = await this.fetchTicketTypeSources();
    const ownedTicketTypeIds = new Set(purchasedTicketTypeIds);
    const eventIds = new Set<string>();

    for (const ticketType of ticketTypes) {
      const ticketTypeId = String(ticketType?.id ?? '').trim();
      const eventId = String(ticketType?.eventId ?? '').trim();
      if (ticketTypeId && eventId && ownedTicketTypeIds.has(ticketTypeId)) {
        eventIds.add(eventId);
      }
    }

    return eventIds;
  }

  private async filterEventsForViewer(events: Event[], authorization?: string): Promise<Event[]> {
    const viewer = this.resolveViewerContext(authorization);

    if (viewer.isAuthenticated && viewer.role === 'admin') {
      const organizerId = viewer.organizerId;
      const organizerEmail = viewer.organizerEmail;
      if (!organizerId && !organizerEmail) {
        return [];
      }
      return events.filter((event) => {
        const eventOrganizerId = String(event.organizerId || '').trim();
        const eventOrganizerEmail = String(event.organizerEmail || '').trim().toLowerCase();
        if (organizerId && eventOrganizerId === organizerId) return true;
        if (organizerEmail && eventOrganizerEmail === organizerEmail) return true;
        return false;
      });
    }

    if (!viewer.isAuthenticated || viewer.role !== 'standard') {
      return events;
    }

    const ownedEventIds = await this.getOwnedPurchasedEventIds(authorization ?? '');
    if (ownedEventIds.size === 0) {
      return [];
    }

    return events.filter((event) => ownedEventIds.has(String(event.id || '').trim()));
  }

  private toResponse(event: Event) {
    const schedule = this.resolveSchedule(event);
    return {
      ...event,
      date: this.combineDateTime(schedule.startDate, schedule.startTime).toISOString(),
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      activeWeekdays: schedule.weekdays,
      description: event.description || '',
      status: schedule.status,
      effectiveStartAt: schedule.firstStartAt.toISOString(),
      effectiveEndAt: schedule.finalEndAt.toISOString(),
      durationDays: schedule.durationDays,
      isArchived: event.isArchived || schedule.status === 'finished',
    };
  }

  private buildEventValues(input: EventInput, existing?: Event) {
    const title = String(input.title ?? existing?.title ?? '').trim();
    const location = String(input.location ?? existing?.location ?? '').trim();
    const description = String(input.description ?? existing?.description ?? '').trim();
    const startDate = this.normalizeDateInput(input.startDate ?? input.date ?? existing?.date, 'startDate');
    const endDate = this.normalizeDateInput(input.endDate ?? existing?.endDate ?? startDate, 'endDate');
    const startTime = this.normalizeTimeInput(input.startTime ?? existing?.startTime, 'startTime', '09:00');
    const endTime = this.normalizeTimeInput(input.endTime ?? existing?.endTime, 'endTime', '18:00');
    const activeWeekdays = this.normalizeWeekdays(input.activeWeekdays ?? existing?.activeWeekdays);

    if (!title) {
      throw new BadRequestException('title is required');
    }
    if (!location) {
      throw new BadRequestException('location is required');
    }

    const startDateValue = this.parseDateOnly(startDate);
    const endDateValue = this.parseDateOnly(endDate);
    if (endDateValue < startDateValue) {
      throw new BadRequestException('La fecha de finalizacion no puede ser anterior a la fecha de inicio');
    }
    if (startDate === endDate && endTime <= startTime) {
      throw new BadRequestException('Para eventos del mismo dia, la hora de finalizacion debe ser posterior a la hora de inicio');
    }

    return {
      title,
      location,
      description: description || null,
      date: this.combineDateTime(startDate, startTime),
      endDate,
      startTime,
      endTime,
      activeWeekdays,
    };
  }

  async create(event: EventInput, organizer?: { id?: string; name?: string; email?: string }) {
    const values = this.buildEventValues(event);
    const organizerId = String(organizer?.id || '').trim();
    const organizerName = String(organizer?.name || '').trim();
    const organizerEmail = String(organizer?.email || '').trim().toLowerCase();
    const newEvent = this.eventRepository.create({
      ...values,
      organizerId: organizerId || null,
      organizerName: organizerName || null,
      organizerEmail: organizerEmail || null,
    });
    const saved = await this.eventRepository.save(newEvent);
    return this.toResponse(saved);
  }

  async findAll(limit = 50, includeArchived = false, authorization?: string) {
    const events = await this.eventRepository.find({
      order: { date: 'ASC' },
      take: Math.max(1, Math.min(limit, 100)),
    });

    const normalized: Event[] = [];
    for (const event of events) {
      const updated = await this.archiveFinishedEventIfNeeded(event);
      if (!includeArchived && updated.isArchived) {
        continue;
      }
      normalized.push(updated);
    }

    const filtered = await this.filterEventsForViewer(normalized, authorization);

    return filtered.map((event) => this.toResponse(event));
  }

  async findOne(id: string) {
    const event = await this.eventRepository.findOneBy({ id });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const updated = await this.archiveFinishedEventIfNeeded(event);
    return this.toResponse(updated);
  }

  async getSummary(authorization?: string) {
    const events = await this.findAll(100, true, authorization);
    const summary = {
      total: events.length,
      upcoming: 0,
      active: 0,
      finished: 0,
      archived: 0,
    };

    for (const event of events) {
      if (event.status === 'upcoming') summary.upcoming += 1;
      if (event.status === 'active') summary.active += 1;
      if (event.status === 'finished') summary.finished += 1;
      if (event.isArchived) summary.archived += 1;
    }

    return {
      ...summary,
    };
  }

  async update(id: string, event: EventInput, organizer?: { id?: string; email?: string }) {
    const existing = await this.eventRepository.findOneBy({ id });
    if (!existing) {
      throw new NotFoundException('Event not found');
    }

    this.assertOrganizerOwnsEvent(existing, organizer);

    Object.assign(existing, this.buildEventValues(event, existing));
    existing.isArchived = false;
    existing.archivedAt = null;
    const saved = await this.eventRepository.save(existing);
    return this.toResponse(saved);
  }

  async remove(id: string, organizer?: { id?: string; email?: string }) {
    const existing = await this.eventRepository.findOneBy({ id });
    if (!existing) {
      return null;
    }
    this.assertOrganizerOwnsEvent(existing, organizer);
    const response = this.toResponse(existing);
    await this.eventRepository.remove(existing);
    return response;
  }

  private assertOrganizerOwnsEvent(event: Event, organizer?: { id?: string; email?: string }) {
    const requesterId = String(organizer?.id || '').trim();
    const requesterEmail = String(organizer?.email || '').trim().toLowerCase();
    if (!requesterId && !requesterEmail) {
      throw new BadRequestException('Organizer context is required');
    }
    const ownerId = String(event.organizerId || '').trim();
    const ownerEmail = String(event.organizerEmail || '').trim().toLowerCase();
    if (!ownerId && !ownerEmail) {
      throw new BadRequestException('Este evento no tiene dueno asignado. Asignalo manualmente antes de modificarlo.');
    }
    const matchesId = requesterId && ownerId && requesterId === ownerId;
    const matchesEmail = requesterEmail && ownerEmail && requesterEmail === ownerEmail;
    if (!matchesId && !matchesEmail) {
      throw new NotFoundException('Event not found');
    }
  }
}
