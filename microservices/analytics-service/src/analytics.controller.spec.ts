import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController', () => {
  const analyticsService = {
    recordTicketPurchase: jest.fn(),
    getSummary: jest.fn(),
    listDailySales: jest.fn(),
    listSalesHistory: jest.fn(),
  };

  const controller = new AnalyticsController(analyticsService as any);

  afterEach(() => jest.clearAllMocks());

  it('returns service health', () => {
    expect(controller.status()).toEqual({ service: 'analytics-service', status: 'ok' });
  });

  it('maps req.user.sub/email to organizerId/organizerEmail when listing daily sales', async () => {
    analyticsService.listDailySales.mockResolvedValueOnce([]);

    await controller.listDailySales(
      { user: { sub: 'org-1', email: 'org@mail.com' } },
      '45',
      'ticket-vip',
    );

    expect(analyticsService.listDailySales).toHaveBeenCalledWith({
      limit: 45,
      ticketTypeId: 'ticket-vip',
      organizerId: 'org-1',
      organizerEmail: 'org@mail.com',
    });
  });

  it('falls back to default limit=30 when not provided', async () => {
    analyticsService.listSalesHistory.mockResolvedValueOnce([]);

    await controller.listSalesHistory({ user: {} }, undefined, undefined);

    expect(analyticsService.listSalesHistory).toHaveBeenCalledWith({
      limit: 30,
      ticketTypeId: undefined,
      organizerId: undefined,
      organizerEmail: undefined,
    });
  });

  it('parses non-numeric limit as NaN and forwards (service is responsible for clamping)', async () => {
    analyticsService.listDailySales.mockResolvedValueOnce([]);

    await controller.listDailySales({ user: {} }, 'not-a-number', undefined);

    expect(analyticsService.listDailySales).toHaveBeenCalledWith(
      expect.objectContaining({ limit: NaN }),
    );
  });

  it('summary maps req.user identity to the organizer DTO consumed by the service', async () => {
    analyticsService.getSummary.mockResolvedValueOnce({ totalRevenue: 0 });

    await controller.summary({ user: { sub: 'org-1', email: 'org@mail.com' } });

    expect(analyticsService.getSummary).toHaveBeenCalledWith({ id: 'org-1', email: 'org@mail.com' });
  });
});
