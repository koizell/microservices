import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  const appService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/events/health (GET)', async () => {
    await request(app.getHttpServer())
      .get('/events/health')
      .expect(200)
      .expect({ service: 'event-service', status: 'ok' });
  });

  it('/events/data/:id (GET) rejects invalid ids', async () => {
    await request(app.getHttpServer())
      .get('/events/data/event-dev-001')
      .expect(400);

    expect(appService.findOne).not.toHaveBeenCalled();
  });
});
