import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AnalyticsController } from './analytics.controller';
import { RabbitMqService } from './rabbitmq.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsSchemaService } from './analytics-schema.service';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { SalesMetric } from './sales-metric.entity';
import { SalesMetricTicket } from './sales-metric-ticket.entity';
import { SalesMetricRepository } from './sales-metric.repository';
import { SalesMetricTicketRepository } from './sales-metric-ticket.repository';
import { RoleGuard } from './guards/role.guard';

const databaseUrl = String(process.env.DATABASE_URL ?? '').trim();

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
      entities: [SalesMetric, SalesMetricTicket],
      synchronize: false,
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
    TypeOrmModule.forFeature([SalesMetric, SalesMetricTicket]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsSchemaService,
    AnalyticsService,
    AnalyticsIngestionService,
    SalesMetricRepository,
    SalesMetricTicketRepository,
    RabbitMqService,
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AppModule {}

