import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from './favorite.entity';
import { Session } from './session.entity';

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
  const normalized: Record<string, string> = { ...headers, 'x-forwarded-by': 'agenda-service' };
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
type CalendarStatusFilter = 'all' | 'pending' | 'past';
type OccurrenceStatus = 'pending' | 'active' | 'past';

type EventCalendarSource = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  date?: string | Date;
  startDate?: string | Date;
  endDate?: string | Date | null;
  startTime?: string | null;
  endTime?: string | null;
  activeWeekdays?: string[] | null;
  status?: string;
  isArchived?: boolean;
};

type CalendarOccurrence = {
  id: string;
  eventId: string;
  title: string;
  description: string;
  location: string;
  date: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
  occurrenceStatus: OccurrenceStatus;
  eventStatus: string;
  isArchived: boolean;
};

type AgendaViewerContext = {
  userId: string | null;
  role: string;
  isAuthenticated: boolean;
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
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name);
  private readonly eventServiceBaseUrl = normalizeServiceBaseUrl(process.env.EVENT_SERVICE_URL, 'http://localhost:3001');
  private readonly ticketingBaseUrl = normalizeServiceBaseUrl(process.env.TICKETING_SERVICE_URL, 'http://localhost:3002');
  private readonly gatewayBaseUrl = normalizeServiceBaseUrl(
    process.env.GATEWAY_BASE_URL ?? process.env.GATEWAY_URL,
    'http://localhost:3008',
  );

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Favorite)
    private readonly favoriteRepository: Repository<Favorite>,
    private readonly jwtService: JwtService,
  ) {}

  async createSession(data: Partial<Session>) {
    const session = this.sessionRepository.create(data);
    return await this.sessionRepository.save(session);
  }

  async listSessions(limit = 50) {
    return await this.sessionRepository.find({
      order: { startTime: 'ASC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
  }

  async addFavorite(data: { userId: string; sessionId: string }) {
    const favorite = this.favoriteRepository.create(data);
    return await this.favoriteRepository.save(favorite);
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

  private dateOnlyFromUnknown(value: string | Date | undefined | null, fieldName: string): string {
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
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }

    return this.formatDateOnly(parsed);
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

  private normalizeStatusFilter(value?: string): CalendarStatusFilter {
    const normalized = String(value ?? 'all').trim().toLowerCase();
    if (normalized === 'pending' || normalized === 'past') {
      return normalized;
    }
    return 'all';
  }

  private occurrenceStatus(startAt: Date, endAt: Date): OccurrenceStatus {
    const now = new Date();
    if (now > endAt) {
      return 'past';
    }
    if (now >= startAt) {
      return 'active';
    }
    return 'pending';
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

  private resolveViewerContext(authorization?: string): AgendaViewerContext {
    const normalizedAuthorization = String(authorization ?? '').trim();
    if (!normalizedAuthorization.startsWith('Bearer ')) {
      return { userId: null, role: 'guest', isAuthenticated: false };
    }

    const token = normalizedAuthorization.slice('Bearer '.length);
    const secret = process.env.JWT_SECRET ?? 'dev_only_change_me';

    try {
      const decoded = this.jwtService.verify(token, { secret }) as {
        sub?: unknown;
        accountType?: unknown;
        role?: unknown;
      };
      const userId = String(decoded?.sub ?? '').trim();
      return {
        userId: userId || null,
        role: this.normalizeRole(String(decoded?.accountType ?? decoded?.role ?? 'guest')),
        isAuthenticated: true,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'token invalido';
      this.logger.warn(`Ignoring agenda viewer token: ${reason}`);
      return { userId: null, role: 'guest', isAuthenticated: false };
    }
  }

  private async requestTicketingArray<T>(baseUrl: string, path: string, authorization?: string): Promise<T[]> {
    const url = new URL(path, baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), resolveInternalRequestTimeoutMs());

    try {
      const headers = buildInternalServiceHeaders({
        Accept: 'application/json',
      });

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
        this.logger.warn(`Falling back to api-gateway for owned agenda orders after direct ticketing-service failure: ${reason}`);
        return await this.requestTicketingArray<OwnedOrderSource>(this.gatewayBaseUrl, '/tickets/orders?limit=100', authorization);
      }

      this.logger.error(`Unable to fetch owned agenda orders: ${reason}`);
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
        this.logger.warn(`Falling back to api-gateway for ticket types used in agenda ownership after direct ticketing-service failure: ${reason}`);
        return await this.requestTicketingArray<TicketTypeSource>(this.gatewayBaseUrl, '/tickets/types?includeInactive=true');
      }

      this.logger.error(`Unable to fetch ticket types for agenda ownership: ${reason}`);
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

  private async fetchEventCalendarSources(limit = 200): Promise<EventCalendarSource[]> {
    try {
      return await this.requestEventCalendarSources(this.eventServiceBaseUrl, limit);
    } catch (error) {
      const reason = describeServiceRequestError(error);
      const canRetryThroughGateway =
        this.gatewayBaseUrl !== this.eventServiceBaseUrl &&
        isRetryableServiceRequestError(error);

      if (canRetryThroughGateway) {
        this.logger.warn(`Falling back to api-gateway for agenda calendar after direct event-service failure: ${reason}`);
        try {
          return await this.requestEventCalendarSources(this.gatewayBaseUrl, limit);
        } catch (gatewayError) {
          const gatewayReason = gatewayError instanceof Error ? gatewayError.message : 'unknown error';
          this.logger.error(`Unable to fetch events for agenda calendar through api-gateway: ${gatewayReason}`);
          throw new ServiceUnavailableException('No se pudo consultar la programacion desde event-service');
        }
      }

      this.logger.error(`Unable to fetch events for agenda calendar: ${reason}`);
      throw new ServiceUnavailableException('No se pudo consultar la programacion desde event-service');
    }
  }

  private async requestEventCalendarSources(baseUrl: string, limit: number): Promise<EventCalendarSource[]> {
    const url = new URL('/events/data', baseUrl);
    url.searchParams.set('includeArchived', 'true');
    url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 500))));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), resolveInternalRequestTimeoutMs());

    try {
      const response = await fetch(url.toString(), {
        headers: buildInternalServiceHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`${baseUrl} responded ${response.status}`);
      }

      const payload = await response.json().catch(() => []);
      return Array.isArray(payload) ? (payload as EventCalendarSource[]) : [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private expandOccurrences(event: EventCalendarSource, rangeStart: string, rangeEnd: string): CalendarOccurrence[] {
    const eventId = String(event.id || '').trim();
    if (!eventId) {
      return [];
    }

    const startDate = this.dateOnlyFromUnknown(event.startDate ?? event.date, 'startDate');
    const endDate = this.dateOnlyFromUnknown(event.endDate ?? startDate, 'endDate');
    const startTime = this.normalizeTimeInput(event.startTime, 'startTime', '09:00');
    const endTime = this.normalizeTimeInput(event.endTime, 'endTime', '18:00');
    const weekdays = this.normalizeWeekdays(event.activeWeekdays);
    const windowStart = this.parseDateOnly(rangeStart);
    const windowEnd = this.parseDateOnly(rangeEnd);
    const eventStart = this.parseDateOnly(startDate);
    const eventEnd = this.parseDateOnly(endDate);

    if (windowEnd < windowStart || eventEnd < eventStart) {
      return [];
    }

    const effectiveStart = eventStart > windowStart ? eventStart : windowStart;
    const effectiveEnd = eventEnd < windowEnd ? eventEnd : windowEnd;
    if (effectiveEnd < effectiveStart) {
      return [];
    }

    const weekdaySet = new Set(weekdays);
    const items: CalendarOccurrence[] = [];
    const cursor = new Date(effectiveStart.getTime());

    while (cursor <= effectiveEnd) {
      const weekday = this.weekdayName(cursor);
      if (weekdaySet.has(weekday)) {
        const date = this.formatDateOnly(cursor);
        const startAt = this.combineDateTime(date, startTime);
        const endAt = this.combineDateTime(date, endTime);
        items.push({
          id: `${eventId}:${date}`,
          eventId,
          title: String(event.title || 'Evento sin titulo').trim(),
          description: String(event.description || '').trim(),
          location: String(event.location || '').trim(),
          date,
          weekday,
          startTime,
          endTime,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          occurrenceStatus: this.occurrenceStatus(startAt, endAt),
          eventStatus: String(event.status || '').trim() || 'upcoming',
          isArchived: Boolean(event.isArchived),
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return items;
  }

  async getCalendarData(params: { start?: string; end?: string; status?: string }, authorization?: string) {
    const start = this.dateOnlyFromUnknown(params.start ?? new Date(), 'start');
    const end = this.dateOnlyFromUnknown(params.end ?? start, 'end');
    const startDate = this.parseDateOnly(start);
    const endDate = this.parseDateOnly(end);

    if (endDate < startDate) {
      throw new BadRequestException('end cannot be earlier than start');
    }

    const status = this.normalizeStatusFilter(params.status);
    const emptyResult = {
      range: { start, end },
      status,
      totals: {
        events: 0,
        occurrences: 0,
        visible: 0,
        pending: 0,
        active: 0,
        past: 0,
        days: 0,
      },
      items: [] as CalendarOccurrence[],
    };

    const viewer = this.resolveViewerContext(authorization);
    let events = await this.fetchEventCalendarSources();

    if (viewer.isAuthenticated && viewer.role === 'standard') {
      const ownedEventIds = await this.getOwnedPurchasedEventIds(authorization ?? '');
      if (ownedEventIds.size === 0) {
        return emptyResult;
      }

      events = events.filter((event) => ownedEventIds.has(String(event.id || '').trim()));
      if (events.length === 0) {
        return emptyResult;
      }
    }

    const allItems: CalendarOccurrence[] = [];

    for (const event of events) {
      const occurrences = this.expandOccurrences(event, start, end);
      for (const occurrence of occurrences) {
        allItems.push(occurrence);
      }
    }

    allItems.sort((left, right) => {
      const timeDiff = new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return left.title.localeCompare(right.title, 'es');
    });

    const filteredItems = allItems.filter((item) => {
      if (status === 'pending') {
        return item.occurrenceStatus !== 'past';
      }
      if (status === 'past') {
        return item.occurrenceStatus === 'past';
      }
      return true;
    });

    let pending = 0;
    let active = 0;
    let past = 0;
    const uniqueDays = new Set<string>();

    for (const item of allItems) {
      uniqueDays.add(item.date);
      if (item.occurrenceStatus === 'past') {
        past += 1;
      } else if (item.occurrenceStatus === 'active') {
        active += 1;
      } else {
        pending += 1;
      }
    }

    return {
      range: { start, end },
      status,
      totals: {
        events: events.length,
        occurrences: allItems.length,
        visible: filteredItems.length,
        pending,
        active,
        past,
        days: uniqueDays.size,
      },
      items: filteredItems,
    };
  }

  async listFavoritesByUser(userId: string, limit = 50) {
    return await this.favoriteRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
  }

  async getSummary(userId: string) {
    const today = this.formatDateOnly(new Date());
    const inThirtyDays = this.formatDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const [sessions, favorites, calendar] = await Promise.all([
      this.sessionRepository.count(),
      this.favoriteRepository.count({ where: { userId } }),
      this.getCalendarData({ start: today, end: inThirtyDays, status: 'all' }).catch(() => ({
        totals: { pending: 0, active: 0, past: 0, visible: 0 },
      })),
    ]);

    return {
      sessions,
      favorites,
      pending: Number(calendar.totals?.pending ?? 0),
      active: Number(calendar.totals?.active ?? 0),
      past: Number(calendar.totals?.past ?? 0),
      visible: Number(calendar.totals?.visible ?? 0),
    };
  }
}
