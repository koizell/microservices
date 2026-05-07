import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let notificationRepository: any;
  let dataSource: any;
  let rabbitMqService: any;
  let emailService: any;
  let service: NotificationService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    notificationRepository = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockImplementation(async (entity) => ({ ...entity, id: 'notif-id' })),
      find: jest.fn(),
      count: jest.fn(),
      findOneBy: jest.fn(),
      remove: jest.fn(),
    };
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    rabbitMqService = { publish: jest.fn(), consume: jest.fn() };
    emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue({ sent: true }),
      sendPasswordResetEmail: jest.fn().mockResolvedValue({ sent: true }),
      sendPasswordChangeConfirmEmail: jest.fn().mockResolvedValue({ sent: true }),
      sendTicketCampaignEmail: jest.fn().mockResolvedValue({ sent: true }),
      sendPurchaseConfirmation: jest.fn().mockResolvedValue({ sent: true }),
      sendOrganizerSaleAlert: jest.fn().mockResolvedValue({ sent: true }),
    };

    service = new NotificationService(notificationRepository, dataSource, rabbitMqService, emailService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('getTicketCampaignAudience — input validation', () => {
    it('throws BadRequest when ticketTypeId is empty or whitespace', async () => {
      await expect(service.getTicketCampaignAudience('   ')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.getTicketCampaignAudience('')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws Forbidden when an organizer tries to access a ticket they do not own', async () => {
      // First call: getTicketCampaignOptions returns [] (organizer owns nothing)
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => '[]',
      } as any);
      dataSource.query.mockResolvedValue([]);

      await expect(
        service.getTicketCampaignAudience('tt-foreign', { organizerId: 'org-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('sendTicketCampaign — input validation', () => {
    it('throws BadRequest when subject is empty', async () => {
      await expect(
        service.sendTicketCampaign({
          ticketTypeId: 'tt-1',
          subject: '   ',
          message: 'hi',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequest when message is empty', async () => {
      await expect(
        service.sendTicketCampaign({
          ticketTypeId: 'tt-1',
          subject: 'Greeting',
          message: '',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequest when audience is empty AND no test recipients are provided', async () => {
      jest.spyOn(service as any, 'getTicketCampaignAudience').mockResolvedValueOnce({
        ticketType: { id: 'tt-1', name: 'VIP' },
        recipients: [],
        totalRecipients: 0,
        totalOrders: 0,
        totalTickets: 0,
        roleBreakdown: { standard: 0, guest: 0, admin: 0 },
        source: 'database-fallback',
      });

      await expect(
        service.sendTicketCampaign({ ticketTypeId: 'tt-1', subject: 'Hi', message: 'Body' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('sendTicketCampaign — simulation mode', () => {
    it('does not send emails or persist notifications when simulate=true', async () => {
      jest.spyOn(service as any, 'getTicketCampaignAudience').mockResolvedValueOnce({
        ticketType: { id: 'tt-1', name: 'VIP' },
        recipients: [
          {
            userId: 'u1',
            name: 'Alice',
            email: 'alice@mail.com',
            accountType: 'standard',
            totalOrders: 1,
            totalTickets: 2,
            lastPurchaseAt: null,
          },
        ],
        totalRecipients: 1,
        totalOrders: 1,
        totalTickets: 2,
        roleBreakdown: { standard: 1, guest: 0, admin: 0 },
        source: 'database-fallback',
      });

      const result = await service.sendTicketCampaign({
        ticketTypeId: 'tt-1',
        subject: 'Hi',
        message: 'Body',
        simulate: 'true',
      });

      expect(result.deliveryMode).toBe('simulation');
      expect(result.simulated).toBe(true);
      expect(emailService.sendTicketCampaignEmail).not.toHaveBeenCalled();
      expect(notificationRepository.save).not.toHaveBeenCalled();
    });

    it('parses truthy strings ("yes", "1", "on", "TRUE") as simulate=true', async () => {
      const audience = {
        ticketType: { id: 'tt-1', name: 'VIP' },
        recipients: [{
          userId: 'u1', name: 'A', email: 'a@m.com', accountType: 'standard',
          totalOrders: 1, totalTickets: 1, lastPurchaseAt: null,
        }],
        totalRecipients: 1,
        totalOrders: 1,
        totalTickets: 1,
        roleBreakdown: { standard: 1, guest: 0, admin: 0 },
        source: 'database-fallback' as const,
      };
      jest.spyOn(service as any, 'getTicketCampaignAudience').mockResolvedValue(audience);

      for (const truthy of ['yes', '1', 'on', 'TRUE', 'True']) {
        emailService.sendTicketCampaignEmail.mockClear();
        const result = await service.sendTicketCampaign({
          ticketTypeId: 'tt-1', subject: 'S', message: 'M', simulate: truthy,
        });
        expect(result.simulated).toBe(true);
        expect(emailService.sendTicketCampaignEmail).not.toHaveBeenCalled();
      }
    });
  });

  describe('sendTicketCampaign — test recipients', () => {
    it('uses test recipients (filtering invalid emails) and labels deliveryMode="test"', async () => {
      jest.spyOn(service as any, 'getTicketCampaignAudience').mockResolvedValueOnce({
        ticketType: { id: 'tt-1', name: 'VIP' },
        recipients: [],
        totalRecipients: 0,
        totalOrders: 0,
        totalTickets: 0,
        roleBreakdown: { standard: 0, guest: 0, admin: 0 },
        source: 'database-fallback',
      });

      const result = await service.sendTicketCampaign({
        ticketTypeId: 'tt-1',
        subject: 'Hi',
        message: 'Body',
        testRecipients: 'good@mail.com, not-an-email, also-bad, OTHER@MAIL.COM',
      });

      expect(result.deliveryMode).toBe('test');
      expect(result.usedTestRecipients).toEqual(['good@mail.com', 'other@mail.com']);
      expect(emailService.sendTicketCampaignEmail).toHaveBeenCalledTimes(2);
    });

    it('deduplicates test recipients regardless of casing', async () => {
      jest.spyOn(service as any, 'getTicketCampaignAudience').mockResolvedValueOnce({
        ticketType: { id: 'tt-1', name: 'VIP' },
        recipients: [],
        totalRecipients: 0,
        totalOrders: 0,
        totalTickets: 0,
        roleBreakdown: { standard: 0, guest: 0, admin: 0 },
        source: 'database-fallback',
      });

      const result = await service.sendTicketCampaign({
        ticketTypeId: 'tt-1',
        subject: 'Hi',
        message: 'Body',
        testRecipients: ['Alice@mail.com', 'alice@mail.com', 'ALICE@MAIL.COM'],
      });

      expect(result.usedTestRecipients).toEqual(['alice@mail.com']);
    });
  });

  describe('sendTicketCampaign — live mode', () => {
    it('persists a notification and sends an email per recipient', async () => {
      jest.spyOn(service as any, 'getTicketCampaignAudience').mockResolvedValueOnce({
        ticketType: { id: 'tt-1', name: 'VIP' },
        recipients: [
          {
            userId: 'u1', name: 'Alice', email: 'alice@m.com',
            accountType: 'standard', totalOrders: 1, totalTickets: 1, lastPurchaseAt: null,
          },
          {
            userId: 'u2', name: 'Bob', email: 'bob@m.com',
            accountType: 'standard', totalOrders: 1, totalTickets: 1, lastPurchaseAt: null,
          },
        ],
        totalRecipients: 2,
        totalOrders: 2,
        totalTickets: 2,
        roleBreakdown: { standard: 2, guest: 0, admin: 0 },
        source: 'ticketing-service',
      });

      const result = await service.sendTicketCampaign({
        ticketTypeId: 'tt-1',
        subject: 'Hi',
        message: 'Body',
      });

      expect(result.deliveryMode).toBe('live');
      expect(notificationRepository.save).toHaveBeenCalledTimes(2);
      expect(emailService.sendTicketCampaignEmail).toHaveBeenCalledTimes(2);
      expect(result.notificationsSaved).toBe(2);
      expect(result.emailsSent).toBe(2);
      expect(result.emailFailures).toEqual([]);
    });

    it('records delivery failures without aborting the rest of the queue', async () => {
      jest.spyOn(service as any, 'getTicketCampaignAudience').mockResolvedValueOnce({
        ticketType: { id: 'tt-1', name: 'VIP' },
        recipients: [
          { userId: 'u1', name: 'A', email: 'a@m.com', accountType: 'standard', totalOrders: 1, totalTickets: 1, lastPurchaseAt: null },
          { userId: 'u2', name: 'B', email: 'b@m.com', accountType: 'standard', totalOrders: 1, totalTickets: 1, lastPurchaseAt: null },
        ],
        totalRecipients: 2,
        totalOrders: 2,
        totalTickets: 2,
        roleBreakdown: { standard: 2, guest: 0, admin: 0 },
        source: 'database-fallback',
      });

      emailService.sendTicketCampaignEmail
        .mockResolvedValueOnce({ sent: true })
        .mockResolvedValueOnce({ sent: false, reason: 'bounced' });

      const result = await service.sendTicketCampaign({
        ticketTypeId: 'tt-1', subject: 'S', message: 'M',
      });

      expect(result.emailsSent).toBe(1);
      expect(result.emailFailures).toEqual([{ email: 'b@m.com', reason: 'bounced' }]);
    });
  });

  describe('ingestTicketPurchased', () => {
    it('saves a notification for the buyer when a recipientEmail is present', async () => {
      const result = await service.ingestTicketPurchased({
        orderId: 'order-1',
        ticketTypeName: 'VIP',
        quantity: 2,
        amount: 100,
        recipientEmail: 'BUYER@mail.com',
      });

      expect(notificationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'buyer@mail.com' }),
      );
      expect(emailService.sendPurchaseConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'buyer@mail.com', orderId: 'order-1', quantity: 2, amount: 100 }),
      );
      expect(result.participantNotificationSaved).toBe(true);
    });

    it('skips the buyer notification when no recipientEmail is provided', async () => {
      const result = await service.ingestTicketPurchased({
        orderId: 'order-1',
        ticketTypeName: 'VIP',
        quantity: 1,
        amount: 50,
      });

      expect(emailService.sendPurchaseConfirmation).not.toHaveBeenCalled();
      expect(result.participantNotificationSaved).toBe(false);
    });

    it('uses the inline organizerEmail without querying the database', async () => {
      await service.ingestTicketPurchased({
        orderId: 'order-1',
        ticketTypeName: 'VIP',
        quantity: 1,
        amount: 50,
        recipientEmail: 'buyer@mail.com',
        organizerEmail: 'ORG@mail.com',
        organizerName: 'Bob',
      });

      expect(dataSource.query).not.toHaveBeenCalled();
      expect(emailService.sendOrganizerSaleAlert).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'org@mail.com', organizerName: 'Bob' }),
      );
    });

    it('looks up admin organizers in the DB when only organizerId is provided', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'org-1', name: 'Org Inc', email: 'admin@mail.com' },
      ]);

      const result = await service.ingestTicketPurchased({
        orderId: 'order-1',
        ticketTypeName: 'VIP',
        quantity: 1,
        amount: 50,
        organizerId: 'org-1',
      });

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM users'),
        ['org-1', 'admin'],
      );
      expect(result.organizersNotified).toBe(1);
    });

    it('skips the organizer notification when neither id nor email resolves a recipient', async () => {
      const result = await service.ingestTicketPurchased({
        orderId: 'order-1',
        ticketTypeName: 'VIP',
        quantity: 1,
        amount: 50,
        recipientEmail: 'buyer@mail.com',
      });

      expect(emailService.sendOrganizerSaleAlert).not.toHaveBeenCalled();
      expect(result.organizersNotified).toBe(0);
    });

    it('reports organizer email failures without aborting', async () => {
      emailService.sendOrganizerSaleAlert.mockResolvedValueOnce({ sent: false, reason: 'rejected' });

      const result = await service.ingestTicketPurchased({
        orderId: 'order-1',
        ticketTypeName: 'VIP',
        quantity: 1,
        amount: 50,
        organizerEmail: 'org@mail.com',
      });

      expect(result.organizersNotified).toBe(1);
      expect(result.organizerEmailsSent).toBe(0);
      expect(result.organizerEmailFailures).toEqual([{ email: 'org@mail.com', reason: 'rejected' }]);
    });

    it('clamps quantity to >=1 when payload contains 0 or negative', async () => {
      await service.ingestTicketPurchased({
        orderId: 'order-1',
        ticketTypeName: 'VIP',
        quantity: 0,
        amount: 50,
        recipientEmail: 'b@m.com',
      });

      expect(emailService.sendPurchaseConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 1 }),
      );
    });
  });

  describe('sendAccountConfirmationEmail', () => {
    it('persists a notification record and forwards to email service', async () => {
      await service.sendAccountConfirmationEmail({
        to: 'u@mail.com',
        name: 'User',
        confirmationUrl: 'https://x/confirm',
      });

      expect(notificationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'u@mail.com', read: false }),
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith({
        to: 'u@mail.com',
        name: 'User',
        confirmationUrl: 'https://x/confirm',
      });
    });
  });
});
