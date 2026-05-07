import { ForbiddenException } from '@nestjs/common';
import { MobileController } from './mobile.controller';

describe('MobileController', () => {
  const controller = new MobileController();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns service health', () => {
    expect(controller.status()).toEqual({ service: 'mobile-api-service', status: 'ok' });
  });

  it('renders the BFF landing UI as HTML', () => {
    const html = controller.renderUi();
    expect(typeof html).toBe('string');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Mobile API Service (BFF)');
  });

  it('rejects when a non-admin tries to read another user\'s dashboard', async () => {
    const req = { user: { sub: 'user-1', accountType: 'standard' } };

    await expect(controller.getDashboard(req as any, 'user-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when role is missing and requesterId does not match userId', async () => {
    const req = { user: { sub: 'user-9' } };

    await expect(controller.getDashboard(req as any, 'user-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('aggregates totals from all upstream services for the owning user', async () => {
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/events/summary')) return jsonResponse({ total: 5 });
      if (url.endsWith('/tickets/summary')) return jsonResponse({ total: 3 });
      if (url.endsWith('/notifications/summary')) return jsonResponse({ total: 7 });
      if (url.endsWith('/agenda/summary/user-1')) return jsonResponse({ sessions: 9, favorites: 2 });
      throw new Error(`unexpected url ${url}`);
    });
    global.fetch = fetchMock as any;

    const result = await controller.getDashboard(
      { user: { sub: 'user-1', accountType: 'standard' } } as any,
      'user-1',
    );

    expect(result).toEqual({
      userId: 'user-1',
      events: 5,
      tickets: 3,
      notifications: 7,
      sessions: 9,
      favorites: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('admins may consult any user dashboard and degrade gracefully when an upstream is down', async () => {
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/events/summary')) return jsonResponse({ total: 4 });
      if (url.endsWith('/tickets/summary')) return brokenResponse();
      if (url.endsWith('/notifications/summary')) throw new Error('network');
      if (url.endsWith('/agenda/summary/foreign-user')) return jsonResponse({ sessions: 1, favorites: 0 });
      throw new Error(`unexpected url ${url}`);
    });
    global.fetch = fetchMock as any;

    const result = await controller.getDashboard(
      { user: { sub: 'admin-1', accountType: 'admin' } } as any,
      'foreign-user',
    );

    expect(result).toEqual({
      userId: 'foreign-user',
      events: 4,
      tickets: 0,
      notifications: 0,
      sessions: 1,
      favorites: 0,
    });
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function brokenResponse() {
  return {
    ok: false,
    status: 500,
    json: async () => ({}),
    text: async () => '',
  } as unknown as Response;
}
