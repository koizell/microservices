import { BadRequestException } from '@nestjs/common';
import { AgendaService } from './agenda.service';

describe('AgendaService.getCalendarData', () => {
  let sessionRepo: any;
  let favoriteRepo: any;
  let jwtService: any;
  let service: AgendaService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    sessionRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn(), count: jest.fn() };
    favoriteRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn(), count: jest.fn() };
    jwtService = { verify: jest.fn() };

    service = new AgendaService(sessionRepo, favoriteRepo, jwtService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  function mockEventSources(events: any[]) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => events,
      text: async () => JSON.stringify(events),
    } as any) as any;
  }

  it('throws BadRequest when end is earlier than start', async () => {
    mockEventSources([]);

    await expect(
      service.getCalendarData({ start: '2026-04-30', end: '2026-04-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns an empty calendar when no events exist', async () => {
    mockEventSources([]);

    const result = await service.getCalendarData({ start: '2026-04-01', end: '2026-04-30' });

    expect(result.totals.events).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('expands a daily event to one occurrence per day in the window', async () => {
    mockEventSources([
      {
        id: 'event-1',
        title: 'Daily Standup',
        startDate: '2026-04-01',
        endDate: '2026-04-03',
        startTime: '09:00',
        endTime: '10:00',
        activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    ]);

    const result = await service.getCalendarData({ start: '2026-04-01', end: '2026-04-30' });

    expect(result.totals.events).toBe(1);
    expect(result.totals.occurrences).toBe(3);
    expect(result.items.map((i) => i.date)).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
  });

  it('respects activeWeekdays — Monday/Wednesday recurrence drops other days', async () => {
    mockEventSources([
      {
        id: 'event-mw',
        title: 'M/W Workshop',
        startDate: '2026-04-06', // Monday
        endDate: '2026-04-12', // Sunday
        startTime: '14:00',
        endTime: '16:00',
        activeWeekdays: ['monday', 'wednesday'],
      },
    ]);

    const result = await service.getCalendarData({ start: '2026-04-01', end: '2026-04-30' });

    const days = result.items.map((i) => i.date);
    expect(days).toEqual(['2026-04-06', '2026-04-08']);
    expect(result.items.every((i) => i.weekday === 'monday' || i.weekday === 'wednesday')).toBe(true);
  });

  it('clamps occurrences to the requested window even when the event spans further', async () => {
    mockEventSources([
      {
        id: 'long-event',
        title: 'Long event',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        startTime: '09:00',
        endTime: '10:00',
        activeWeekdays: ['monday'],
      },
    ]);

    const result = await service.getCalendarData({ start: '2026-04-06', end: '2026-04-20' });

    const days = result.items.map((i) => i.date);
    expect(days).toEqual(['2026-04-06', '2026-04-13', '2026-04-20']);
  });

  it('rejects events whose end date is before their start date', async () => {
    mockEventSources([
      {
        id: 'broken',
        title: 'broken',
        startDate: '2026-04-10',
        endDate: '2026-04-05',
        startTime: '09:00',
        endTime: '10:00',
      },
    ]);

    const result = await service.getCalendarData({ start: '2026-04-01', end: '2026-04-30' });

    expect(result.totals.occurrences).toBe(0);
  });

  it('classifies past occurrences when their endAt is before now and counts them in totals', async () => {
    const today = new Date();
    today.setDate(today.getDate() - 5);
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const past = `${yyyy}-${mm}-${dd}`;

    mockEventSources([
      {
        id: 'past-event',
        title: 'Past',
        startDate: past,
        endDate: past,
        startTime: '09:00',
        endTime: '10:00',
        activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    ]);

    const result = await service.getCalendarData({
      start: `${yyyy}-01-01`,
      end: `${yyyy}-12-31`,
      status: 'all',
    });

    expect(result.totals.past).toBeGreaterThanOrEqual(1);
    expect(result.items[0].occurrenceStatus).toBe('past');
  });

  it('filters items by status="past" without changing the totals', async () => {
    mockEventSources([
      {
        id: 'past',
        title: 'Past',
        startDate: '2020-01-01',
        endDate: '2020-01-01',
        startTime: '09:00',
        endTime: '10:00',
        activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
      {
        id: 'future',
        title: 'Future',
        startDate: '2099-12-31',
        endDate: '2099-12-31',
        startTime: '09:00',
        endTime: '10:00',
        activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    ]);

    const past = await service.getCalendarData({ start: '2020-01-01', end: '2099-12-31', status: 'past' });
    expect(past.items.every((i) => i.occurrenceStatus === 'past')).toBe(true);
    expect(past.totals.past).toBeGreaterThanOrEqual(1);
    expect(past.totals.pending).toBeGreaterThanOrEqual(1);

    const pending = await service.getCalendarData({ start: '2020-01-01', end: '2099-12-31', status: 'pending' });
    expect(pending.items.every((i) => i.occurrenceStatus !== 'past')).toBe(true);
  });

  it('sorts items by startAt ascending, then by title for ties', async () => {
    mockEventSources([
      {
        id: 'b',
        title: 'B Event',
        startDate: '2026-04-10',
        endDate: '2026-04-10',
        startTime: '10:00',
        endTime: '11:00',
        activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
      {
        id: 'a',
        title: 'A Event',
        startDate: '2026-04-10',
        endDate: '2026-04-10',
        startTime: '10:00',
        endTime: '11:00',
        activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
      {
        id: 'early',
        title: 'Early',
        startDate: '2026-04-09',
        endDate: '2026-04-09',
        startTime: '08:00',
        endTime: '09:00',
        activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    ]);

    const result = await service.getCalendarData({ start: '2026-04-01', end: '2026-04-30' });

    expect(result.items[0].title).toBe('Early');
    expect(result.items[1].title).toBe('A Event');
    expect(result.items[2].title).toBe('B Event');
  });

  it('falls back to default startTime/endTime when missing on the source event', async () => {
    mockEventSources([
      {
        id: 'no-time',
        title: 'No Time',
        startDate: '2026-04-10',
        endDate: '2026-04-10',
        activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    ]);

    const result = await service.getCalendarData({ start: '2026-04-01', end: '2026-04-30' });

    expect(result.items[0].startTime).toBe('09:00');
    expect(result.items[0].endTime).toBe('18:00');
  });

  it('uses all weekdays as a default when activeWeekdays is empty', async () => {
    mockEventSources([
      {
        id: 'all',
        title: 'All',
        startDate: '2026-04-06',
        endDate: '2026-04-12',
        startTime: '09:00',
        endTime: '10:00',
        activeWeekdays: [],
      },
    ]);

    const result = await service.getCalendarData({ start: '2026-04-01', end: '2026-04-30' });

    expect(result.totals.occurrences).toBe(7);
  });

  it('does not contact ticketing-service for guest viewers (no Bearer token)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'event-1',
          title: 'Public',
          startDate: '2026-04-10',
          endDate: '2026-04-10',
          startTime: '09:00',
          endTime: '10:00',
          activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        },
      ],
      text: async () => '',
    } as any);
    global.fetch = fetchMock as any;

    await service.getCalendarData({ start: '2026-04-01', end: '2026-04-30' });

    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((url) => url.includes('/tickets/orders'))).toBe(false);
  });

  it('filters events to only those owned by a standard viewer with an active token', async () => {
    jwtService.verify.mockReturnValue({ sub: 'user-1', accountType: 'standard' });

    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/events/data')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'owned-event',
              title: 'Owned',
              startDate: '2026-04-10',
              endDate: '2026-04-10',
              startTime: '09:00',
              endTime: '10:00',
              activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            },
            {
              id: 'foreign-event',
              title: 'Foreign',
              startDate: '2026-04-12',
              endDate: '2026-04-12',
              startTime: '09:00',
              endTime: '10:00',
              activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            },
          ],
          text: async () => '',
        } as any;
      }
      if (url.includes('/tickets/orders')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'o-1', ticketTypeId: 'tt-1', status: 'paid' }],
          text: async () => '',
        } as any;
      }
      if (url.includes('/tickets/types')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'tt-1', eventId: 'owned-event' }],
          text: async () => '',
        } as any;
      }
      throw new Error(`unexpected url ${url}`);
    });
    global.fetch = fetchMock as any;

    const result = await service.getCalendarData(
      { start: '2026-04-01', end: '2026-04-30' },
      'Bearer fake.token',
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].eventId).toBe('owned-event');
  });

  it('returns empty when a standard viewer has no paid orders', async () => {
    jwtService.verify.mockReturnValue({ sub: 'user-1', accountType: 'standard' });

    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/events/data')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'event-1',
              title: 'Public',
              startDate: '2026-04-10',
              endDate: '2026-04-10',
              startTime: '09:00',
              endTime: '10:00',
              activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            },
          ],
          text: async () => '',
        } as any;
      }
      if (url.includes('/tickets/orders')) {
        return { ok: true, status: 200, json: async () => [], text: async () => '' } as any;
      }
      throw new Error(`unexpected url ${url}`);
    });
    global.fetch = fetchMock as any;

    const result = await service.getCalendarData(
      { start: '2026-04-01', end: '2026-04-30' },
      'Bearer fake.token',
    );

    expect(result.items).toHaveLength(0);
    expect(result.totals.events).toBe(0);
  });

  it('treats invalid JWTs as guest viewers (no filtering applied)', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    mockEventSources([
      {
        id: 'event-1',
        title: 'Public',
        startDate: '2026-04-10',
        endDate: '2026-04-10',
        startTime: '09:00',
        endTime: '10:00',
        activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    ]);

    const result = await service.getCalendarData(
      { start: '2026-04-01', end: '2026-04-30' },
      'Bearer broken.token',
    );

    expect(result.items).toHaveLength(1);
  });
});

describe('AgendaService basic CRUD', () => {
  let sessionRepo: any;
  let favoriteRepo: any;
  let service: AgendaService;

  beforeEach(() => {
    sessionRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'session-id' })),
      save: jest.fn().mockImplementation(async (entity) => entity),
      find: jest.fn(),
      count: jest.fn(),
    };
    favoriteRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'fav-id' })),
      save: jest.fn().mockImplementation(async (entity) => entity),
      find: jest.fn(),
      count: jest.fn(),
    };

    service = new AgendaService(sessionRepo, favoriteRepo, { verify: jest.fn() } as any);
  });

  it('clamps the limit to [1, 100] when listing sessions', async () => {
    sessionRepo.find.mockResolvedValue([]);

    await service.listSessions(0);
    expect(sessionRepo.find.mock.calls[0][0].take).toBe(1);

    await service.listSessions(500);
    expect(sessionRepo.find.mock.calls[1][0].take).toBe(100);

    await service.listSessions(50);
    expect(sessionRepo.find.mock.calls[2][0].take).toBe(50);
  });

  it('clamps the favorite limit to [1, 100]', async () => {
    favoriteRepo.find.mockResolvedValue([]);

    await service.listFavoritesByUser('user-1', -10);
    expect(favoriteRepo.find.mock.calls[0][0].take).toBe(1);

    await service.listFavoritesByUser('user-1', 1000);
    expect(favoriteRepo.find.mock.calls[1][0].take).toBe(100);
  });
});
