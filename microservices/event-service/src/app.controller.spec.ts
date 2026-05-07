import { AppController } from './app.controller';

describe('AppController', () => {
  const appService = {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findAll: jest.fn(),
    countAll: jest.fn(),
  };

  const controller = new AppController(appService as any);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns service health', () => {
    expect(controller.status()).toEqual({ service: 'event-service', status: 'ok' });
  });

  it('renders the events UI as HTML', () => {
    const html = controller.renderUi();
    expect(typeof html).toBe('string');
    expect(html).toContain('Crear evento');
  });

  it('marks the UI as read-only when invoked with mode=viewer', () => {
    const html = controller.renderUi('viewer');
    expect(html).toContain('class="read-only"');
  });

  it('delegates findOne to the service for valid event ids', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const payload = { id, title: 'Evento demo' };
    appService.findOne.mockResolvedValueOnce(payload);

    const result = await controller.findOne(id);

    expect(appService.findOne).toHaveBeenCalledWith(id);
    expect(result).toEqual(payload);
  });
});
