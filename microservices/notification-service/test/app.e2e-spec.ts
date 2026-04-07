import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { NotificationController } from './../src/notification.controller';
import { NotificationService } from './../src/notification.service';

describe('NotificationController (e2e)', () => {
  let app: INestApplication;
  const notificationService = {
    create: jest.fn(),
    sendAccountConfirmationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    ingestTicketPurchased: jest.fn(),
    getTicketCampaignOptions: jest.fn(),
    getTicketCampaignAudience: jest.fn(),
    sendTicketCampaign: jest.fn(),
    countAll: jest.fn(),
    findAll: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        {
          provide: NotificationService,
          useValue: notificationService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/notifications/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/notifications/health')
      .expect(200)
      .expect({ service: 'notification-service', status: 'ok' });
  });

  it('/notifications (GET) redirects to frontend', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications')
      .expect(302);

    expect(response.headers.location).toBe('http://localhost:3009/?panel=notificaciones');
  });
});
