import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let app: INestApplication;

  const appService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns service health', async () => {
    await request(app.getHttpServer())
      .get('/events/health')
      .expect(200)
      .expect({ service: 'event-service', status: 'ok' });
  });

  it('rejects invalid event ids before reaching the service', async () => {
    await request(app.getHttpServer())
      .get('/events/data/event-ui-001')
      .expect(400);

    expect(appService.findOne).not.toHaveBeenCalled();
  });

  it('delegates valid event ids to the service', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const payload = { id, title: 'Evento demo' };

    appService.findOne.mockResolvedValueOnce(payload);

    await request(app.getHttpServer())
      .get(`/events/data/${id}`)
      .expect(200)
      .expect(payload);

    expect(appService.findOne).toHaveBeenCalledWith(id);
  });
});
