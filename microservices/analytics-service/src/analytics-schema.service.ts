import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const ANALYTICS_SCHEMA_COLUMNS = [
  { tableName: 'daily_sales', legacyName: 'totalRevenue', columnName: 'total_revenue', definition: 'NUMERIC(14,2) NOT NULL DEFAULT 0' },
  { tableName: 'daily_sales', legacyName: 'totalTickets', columnName: 'total_tickets', definition: 'INT NOT NULL DEFAULT 0' },
  { tableName: 'daily_sales_tickets', legacyName: 'ticketTypeId', columnName: 'ticket_type_id', definition: 'TEXT NOT NULL' },
  { tableName: 'daily_sales_tickets', legacyName: 'ticketTypeName', columnName: 'ticket_type_name', definition: 'TEXT NULL' },
  { tableName: 'daily_sales_tickets', legacyName: 'totalRevenue', columnName: 'total_revenue', definition: 'NUMERIC(14,2) NOT NULL DEFAULT 0' },
  { tableName: 'daily_sales_tickets', legacyName: 'totalTickets', columnName: 'total_tickets', definition: 'INT NOT NULL DEFAULT 0' },
] as const;

@Injectable()
export class AnalyticsSchemaService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsSchemaService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.ensureAnalyticsSchema();
  }

  private async ensureAnalyticsSchema() {
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS daily_sales (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        day DATE NOT NULL UNIQUE,
        total_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_tickets INT NOT NULL DEFAULT 0
      )
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS daily_sales_tickets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        day DATE NOT NULL,
        ticket_type_id TEXT NOT NULL,
        ticket_type_name TEXT NULL,
        total_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_tickets INT NOT NULL DEFAULT 0,
        UNIQUE (day, ticket_type_id)
      )
    `);

    for (const column of ANALYTICS_SCHEMA_COLUMNS) {
      await this.renameLegacyColumnIfNeeded(column.tableName, column.legacyName, column.columnName);
      await this.dataSource.query(
        `ALTER TABLE ${column.tableName} ADD COLUMN IF NOT EXISTS ${column.columnName} ${column.definition}`,
      );
    }

    await this.dataSource.query(`
      UPDATE daily_sales
      SET
        total_revenue = COALESCE(total_revenue, 0),
        total_tickets = COALESCE(total_tickets, 0)
      WHERE total_revenue IS NULL
        OR total_tickets IS NULL
    `);

    await this.dataSource.query(`
      UPDATE daily_sales_tickets
      SET
        ticket_type_name = NULLIF(ticket_type_name, ''),
        total_revenue = COALESCE(total_revenue, 0),
        total_tickets = COALESCE(total_tickets, 0)
      WHERE ticket_type_name = ''
        OR total_revenue IS NULL
        OR total_tickets IS NULL
    `);

    this.logger.log('Verified analytics tables schema');
  }

  private async renameLegacyColumnIfNeeded(tableName: string, legacyName: string, columnName: string) {
    await this.dataSource.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = '${tableName}'
            AND column_name = '${legacyName}'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = '${tableName}'
            AND column_name = '${columnName}'
        ) THEN
          EXECUTE 'ALTER TABLE ${tableName} RENAME COLUMN "${legacyName}" TO ${columnName}';
        END IF;
      END
      $$;
    `);
  }
}