import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let dataSource: any;
  let salesRepository: any;
  let salesTicketRepository: any;
  let service: AnalyticsService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    salesRepository = {
      findByDay: jest.fn(),
      createEmpty: jest.fn().mockImplementation((day: string) => ({ day, totalRevenue: 0, totalTickets: 0 })),
      save: jest.fn().mockImplementation(async (entity: any) => entity),
    };
    salesTicketRepository = {
      findByDayAndTicket: jest.fn(),
      createEmpty: jest.fn().mockImplementation((day: string, ticketTypeId: string, ticketTypeName?: string) => ({
        day,
        ticketTypeId,
        ticketTypeName,
        totalRevenue: 0,
        totalTickets: 0,
      })),
      save: jest.fn().mockImplementation(async (entity: any) => entity),
    };

    service = new AnalyticsService(dataSource, salesRepository, salesTicketRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('recordTicketPurchase — input validation', () => {
    it('rejects negative amounts with BadRequestException (synchronous, no DB call)', async () => {
      await expect(service.recordTicketPurchase({ amount: -10 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(salesRepository.save).not.toHaveBeenCalled();
    });

    it('rejects NaN amounts with BadRequestException', async () => {
      await expect(service.recordTicketPurchase({ amount: Number.NaN })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects zero/negative quantities with BadRequestException', async () => {
      await expect(service.recordTicketPurchase({ amount: 100, quantity: 0 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.recordTicketPurchase({ amount: 100, quantity: -5 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('wraps repository failures in InternalServerErrorException (validation passed)', async () => {
      salesRepository.findByDay.mockRejectedValueOnce(new Error('db down'));

      await expect(service.recordTicketPurchase({ amount: 100, quantity: 1 })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('floors fractional quantities to whole tickets', async () => {
      salesRepository.findByDay.mockResolvedValueOnce(null);

      await service.recordTicketPurchase({ amount: 100, quantity: 2.9 });

      expect(salesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ totalTickets: 2 }),
      );
    });

    it('defaults the quantity to 1 when omitted', async () => {
      salesRepository.findByDay.mockResolvedValueOnce(null);

      await service.recordTicketPurchase({ amount: 50 });

      expect(salesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ totalTickets: 1, totalRevenue: 50 }),
      );
    });
  });

  describe('recordTicketPurchase — accumulation', () => {
    it('creates a new daily metric when the day has no record yet', async () => {
      salesRepository.findByDay.mockResolvedValueOnce(null);

      await service.recordTicketPurchase({ amount: 200, quantity: 4 });

      expect(salesRepository.createEmpty).toHaveBeenCalled();
      expect(salesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ totalRevenue: 200, totalTickets: 4 }),
      );
    });

    it('accumulates revenue and tickets onto an existing daily metric', async () => {
      salesRepository.findByDay.mockResolvedValueOnce({ day: '2026-04-30', totalRevenue: 100, totalTickets: 2 });

      await service.recordTicketPurchase({ amount: 50, quantity: 1 });

      expect(salesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ totalRevenue: 150, totalTickets: 3 }),
      );
    });

    it('writes a per-ticket metric when ticketTypeId is provided', async () => {
      salesRepository.findByDay.mockResolvedValueOnce(null);
      salesTicketRepository.findByDayAndTicket.mockResolvedValueOnce(null);

      await service.recordTicketPurchase({
        amount: 75,
        quantity: 3,
        ticketTypeId: 'tt-1',
        ticketTypeName: 'VIP',
      });

      expect(salesTicketRepository.createEmpty).toHaveBeenCalledWith(expect.any(String), 'tt-1', 'VIP');
      expect(salesTicketRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ ticketTypeId: 'tt-1', totalRevenue: 75, totalTickets: 3 }),
      );
    });

    it('does NOT write a per-ticket metric when ticketTypeId is missing', async () => {
      salesRepository.findByDay.mockResolvedValueOnce(null);

      await service.recordTicketPurchase({ amount: 75, quantity: 3 });

      expect(salesTicketRepository.save).not.toHaveBeenCalled();
    });

    it('accumulates per-ticket metric for repeated purchases on the same day', async () => {
      salesRepository.findByDay.mockResolvedValueOnce(null);
      salesTicketRepository.findByDayAndTicket.mockResolvedValueOnce({
        day: '2026-04-30',
        ticketTypeId: 'tt-1',
        totalRevenue: 100,
        totalTickets: 2,
      });

      await service.recordTicketPurchase({ amount: 50, quantity: 1, ticketTypeId: 'tt-1' });

      expect(salesTicketRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ ticketTypeId: 'tt-1', totalRevenue: 150, totalTickets: 3 }),
      );
    });
  });

  describe('listDailySales / listSalesHistory', () => {
    it('clamps the limit between 1 and 90 inclusive', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.listDailySales({ limit: 500 });
      expect(dataSource.query.mock.calls[0][1].at(-1)).toBe(90);

      await service.listDailySales({ limit: 0 });
      expect(dataSource.query.mock.calls[1][1].at(-1)).toBe(30);

      await service.listDailySales({ limit: -10 });
      expect(dataSource.query.mock.calls[2][1].at(-1)).toBe(30);

      await service.listDailySales({ limit: 50 });
      expect(dataSource.query.mock.calls[3][1].at(-1)).toBe(50);
    });

    it('parses numeric strings returned by Postgres into numbers', async () => {
      dataSource.query.mockResolvedValue([{ day: '2026-04-30', totalRevenue: '123.45', totalTickets: '4' }]);

      const result = await service.listDailySales({ limit: 10 });

      expect(result[0]).toEqual({
        day: '2026-04-30',
        totalRevenue: 123.45,
        totalTickets: 4,
      });
    });

    it('appends an organizerId filter as a parameterized SQL fragment', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.listDailySales({ limit: 10, organizerId: 'org-1' });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('organizer_id = $');
      expect(params).toContain('org-1');
    });

    it('appends an organizerEmail filter, lowercased, as a parameter', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.listDailySales({ limit: 10, organizerEmail: 'ORG@MAIL.com' });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('LOWER(tt.organizer_email) = $');
      expect(params).toContain('org@mail.com');
    });

    it('combines ticketTypeId + organizerId in the same query', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.listSalesHistory({ limit: 10, ticketTypeId: 'tt-1', organizerId: 'org-1' });

      const [, params] = dataSource.query.mock.calls[0];
      expect(params).toContain('tt-1');
      expect(params).toContain('org-1');
    });

    it('does NOT add organizer filter when both id and email are missing', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.listDailySales({ limit: 10 });

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).not.toContain('organizer_id');
      expect(sql).not.toContain('organizer_email');
    });

    it('only filters by paid/succeeded/approved orders', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.listDailySales({ limit: 10 });

      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).toContain("'paid', 'succeeded', 'approved'");
    });

    it('wraps Postgres errors in InternalServerErrorException', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('connection lost'));

      await expect(service.listDailySales({ limit: 10 })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('getSummary', () => {
    it('returns numeric totals defaulting to 0 when no rows are found', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ daysTracked: 0 }])
        .mockResolvedValueOnce([{ todayRevenue: '0', todayTickets: 0 }]);

      const result = await service.getSummary();

      expect(result).toEqual({ daysTracked: 0, todayRevenue: 0, todayTickets: 0 });
    });

    it('parses numeric strings to numbers', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ daysTracked: 12 }])
        .mockResolvedValueOnce([{ todayRevenue: '1234.50', todayTickets: '7' }]);

      const result = await service.getSummary();

      expect(result).toEqual({ daysTracked: 12, todayRevenue: 1234.5, todayTickets: 7 });
    });

    it('wraps errors as InternalServerErrorException', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('boom'));

      await expect(service.getSummary()).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
