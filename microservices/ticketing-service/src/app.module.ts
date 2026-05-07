import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { Order } from './order.entity';
import { Ticket } from './ticket.entity';
import { TicketType } from './ticket-type.entity';
import { PaymentService } from './payment.service';
import { RabbitMqService } from './rabbitmq.service';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { MercadoPagoService } from './mercadopago.service';
import { RoleGuard } from './guards/role.guard';

const databaseUrl = String(process.env.DATABASE_URL ?? '').trim();
const shouldSynchronize = String(
  process.env.DB_SYNCHRONIZE ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true'),
)
  .trim()
  .toLowerCase() === 'true';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...(databaseUrl
        ? {
            url: databaseUrl,
          }
        : {
            host: process.env.DB_HOST ?? 'localhost',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASSWORD ?? '',
            database: process.env.DB_NAME ?? 'postgres',
          }),
      entities: [Ticket, Order, TicketType],
      synchronize: shouldSynchronize,
      autoLoadEntities: true,
      extra: {
        max: Number(process.env.DB_POOL_MAX ?? 3),
        min: 0,
        idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
      },
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev_only_change_me',
      signOptions: { expiresIn: '1h' },
    }),
    TypeOrmModule.forFeature([Ticket, Order, TicketType]),
  ],
  controllers: [TicketController],
  providers: [
    TicketService,
    PaymentService,
    RabbitMqService,
    MercadoPagoService,
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AppModule {}

