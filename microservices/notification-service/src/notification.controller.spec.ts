import { describe, expect, it, jest } from '@jest/globals';
import { NotificationController } from './notification.controller';

describe('NotificationController', () => {
  const notificationService = {
    create: jest.fn(),
    getTicketCampaignOptions: jest.fn(),
    getTicketCampaignAudience: jest.fn(),
    countAll: jest.fn(),
  };

  const controller = new NotificationController(notificationService as any);

  it('returns service health', () => {
    expect(controller.status()).toEqual({ service: 'notification-service', status: 'ok' });
  });

  it('builds the frontend redirect url', () => {
    process.env.FRONTEND_URL = 'http://localhost:3010/';

    expect(controller.redirectToFrontend({})).toEqual({
      url: 'http://localhost:3010/?panel=notificaciones',
    });
  });

  it('normalizes includeInactive before requesting campaign options', async () => {
    (notificationService.getTicketCampaignOptions as any).mockResolvedValueOnce([{ id: 'type-1' }]);

    const result = await controller.getTicketCampaignOptions('organizer-1', 'org@mail.com', 'YES');

    expect(notificationService.getTicketCampaignOptions).toHaveBeenCalledWith({
      organizerId: 'organizer-1',
      organizerEmail: 'org@mail.com',
      includeInactive: true,
    });
    expect(result).toEqual([{ id: 'type-1' }]);
  });

  it('normalizes includeAdmin before requesting campaign audience', async () => {
    (notificationService.getTicketCampaignAudience as any).mockResolvedValueOnce({ totalRecipients: 4 });

    const result = await controller.getTicketCampaignAudience('ticket-1', '1', 'organizer-1', 'org@mail.com');

    expect(notificationService.getTicketCampaignAudience).toHaveBeenCalledWith('ticket-1', {
      includeAdmin: true,
      organizerId: 'organizer-1',
      organizerEmail: 'org@mail.com',
    });
    expect(result).toEqual({ totalRecipients: 4 });
  });

  it('returns summary count from the service', async () => {
    (notificationService.countAll as any).mockResolvedValueOnce(5);

    await expect(controller.summary()).resolves.toEqual({ total: 5 });
  });
});