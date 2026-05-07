import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { TicketController } from './ticket.controller';

describe('TicketController', () => {
  const ticketService = {
    getTicketTypes: jest.fn(),
    createTicketType: jest.fn(),
    countAll: jest.fn(),
  };

  const mpService = { isEnabled: jest.fn().mockReturnValue(false), createPreference: jest.fn(), getPayment: jest.fn() };

  const controller = new TicketController(ticketService as any, mpService as any);

  it('returns service health', () => {
    expect(controller.status()).toEqual({ service: 'ticketing-service', status: 'ok' });
  });

  it('normalizes filters before loading ticket types', async () => {
    (ticketService.getTicketTypes as any).mockResolvedValueOnce([{ id: 'type-1' }]);

    const result = await controller.getTicketTypes('event-1', 'YES', ' org-1 ', ' ADMIN@MAIL.COM ');

    expect(ticketService.getTicketTypes).toHaveBeenCalledWith('event-1', true, {
      id: 'org-1',
      email: 'admin@mail.com',
    });
    expect(result).toEqual([{ id: 'type-1' }]);
  });

  it('rejects invalid ticket type payloads before delegating', async () => {
    await expect(
      controller.createTicketType(
        { user: { sub: 'admin-1', name: 'Admin', email: 'admin@mail.com' } },
        { name: '', price: -1, quantity: -1 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ticketService.createTicketType).not.toHaveBeenCalled();
  });

  it('maps organizer data when creating a ticket type', async () => {
    const created = { id: 'type-1' };
    (ticketService.createTicketType as any).mockResolvedValueOnce(created);

    const result = await controller.createTicketType(
      { user: { sub: 'admin-1', name: 'Admin', email: 'admin@mail.com' } },
      {
        name: 'VIP',
        price: 50,
        quantity: 100,
        eventId: 'event-1',
        category: 'premium',
        maxPerPerson: 4,
        teamImageUrl: 'data:image/png;base64,abc123',
      },
    );

    expect(ticketService.createTicketType).toHaveBeenCalledWith({
      name: 'VIP',
      price: 50,
      quantity: 100,
      eventId: 'event-1',
      category: 'premium',
      maxPerPerson: 4,
      teamImageUrl: 'data:image/png;base64,abc123',
      organizerId: 'admin-1',
      organizerName: 'Admin',
      organizerEmail: 'admin@mail.com',
    });
    expect(result).toBe(created);
  });

  it('returns summary count from the service', async () => {
    (ticketService.countAll as any).mockResolvedValueOnce(7);

    await expect(controller.summary()).resolves.toEqual({ total: 7 });
  });
});