import { ForbiddenException } from '@nestjs/common';
import { AgendaController } from './agenda.controller';

describe('AgendaController', () => {
  const agendaService = {
    getCalendarData: jest.fn(),
    createSession: jest.fn(),
    listSessions: jest.fn(),
    addFavorite: jest.fn(),
    listFavoritesByUser: jest.fn(),
    getSummary: jest.fn(),
  };

  const controller = new AgendaController(agendaService as any);

  afterEach(() => jest.clearAllMocks());

  it('returns service health', () => {
    expect(controller.status()).toEqual({ service: 'agenda-service', status: 'ok' });
  });

  it('parses date strings into Date instances when creating a session', async () => {
    agendaService.createSession.mockResolvedValueOnce({ id: 'session-1' });

    await controller.createSession({
      eventId: 'event-1',
      title: 'Charla',
      description: 'desc',
      startTime: '2026-04-01T10:00:00Z',
      endTime: '2026-04-01T11:00:00Z',
      room: 'Aula A',
      capacity: 30,
      speakerName: 'Ana',
    });

    const arg = agendaService.createSession.mock.calls[0][0];
    expect(arg.startTime).toBeInstanceOf(Date);
    expect(arg.endTime).toBeInstanceOf(Date);
    expect(arg.startTime.getTime()).toBe(new Date('2026-04-01T10:00:00Z').getTime());
  });

  it('clamps the limit query string into a numeric value when listing sessions', async () => {
    agendaService.listSessions.mockResolvedValueOnce([]);

    await controller.listSessions('25');

    expect(agendaService.listSessions).toHaveBeenCalledWith(25);
  });

  it('uses the requester id when standard users add a favorite (ignores body.userId)', async () => {
    agendaService.addFavorite.mockResolvedValueOnce({ id: 'fav-1' });

    await controller.addFavorite(
      { user: { sub: 'user-1', accountType: 'standard' } },
      { userId: 'user-2', sessionId: 'session-1' },
    );

    expect(agendaService.addFavorite).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'session-1',
    });
  });

  it('honors the requested userId when admin adds a favorite for another user', async () => {
    agendaService.addFavorite.mockResolvedValueOnce({ id: 'fav-1' });

    await controller.addFavorite(
      { user: { sub: 'admin-1', accountType: 'admin' } },
      { userId: 'user-9', sessionId: 'session-2' },
    );

    expect(agendaService.addFavorite).toHaveBeenCalledWith({
      userId: 'user-9',
      sessionId: 'session-2',
    });
  });

  it('rejects favorites when no requester nor target user can be resolved', async () => {
    await expect(
      controller.addFavorite({ user: {} }, { sessionId: 'session-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(agendaService.addFavorite).not.toHaveBeenCalled();
  });

  it('forbids non-admin users from listing favorites of another user', async () => {
    await expect(
      controller.listFavoritesByUser(
        { user: { sub: 'user-1', accountType: 'standard' } },
        'user-2',
        '20',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(agendaService.listFavoritesByUser).not.toHaveBeenCalled();
  });

  it('lets a standard user list their own favorites', async () => {
    agendaService.listFavoritesByUser.mockResolvedValueOnce([]);

    await controller.listFavoritesByUser(
      { user: { sub: 'user-1', accountType: 'standard' } },
      'user-1',
      '20',
    );

    expect(agendaService.listFavoritesByUser).toHaveBeenCalledWith('user-1', 20);
  });

  it('lets admins read any user\'s summary', async () => {
    agendaService.getSummary.mockResolvedValueOnce({ sessions: 1, favorites: 0 });

    await controller.summary({ user: { sub: 'admin-1', accountType: 'admin' } }, 'user-9');

    expect(agendaService.getSummary).toHaveBeenCalledWith('user-9');
  });

  it('forbids non-admin from reading another user\'s summary', async () => {
    await expect(
      controller.summary({ user: { sub: 'user-1', accountType: 'standard' } }, 'user-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(agendaService.getSummary).not.toHaveBeenCalled();
  });
});
