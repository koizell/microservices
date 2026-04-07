import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TicketController } from './../src/ticket.controller';
import { TicketService } from './../src/ticket.service';
import { RoleGuard } from './../src/guards/role.guard';

describe('TicketController (e2e)', () => {
  let app: INestApplication;
  const ticketService = {};

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TicketController],
      providers: [
        {
          provide: TicketService,
          useValue: ticketService,
        },
      ],
    })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/tickets/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/tickets/health')
      .expect(200)
      .expect({ service: 'ticketing-service', status: 'ok' });
  });
});
