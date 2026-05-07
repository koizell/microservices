import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SalesMetricRepository } from './sales-metric.repository';
import { SalesMetricTicketRepository } from './sales-metric-ticket.repository';

const PAID_ORDER_STATUSES_SQL = "'paid', 'succeeded', 'approved'";

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly salesRepository: SalesMetricRepository,
    private readonly salesTicketRepository: SalesMetricTicketRepository,
  ) {}

  async recordTicketPurchase(data: {
    amount: number;
    quantity?: number;
    ticketTypeId?: string | null;
    ticketTypeName?: string | null;
  }) {
    const amount = this.parseAmount(data.amount);
    const quantity = this.parseQuantity(data.quantity);
    const day = this.getTodayIsoDate();

    try {
      const metric = (await this.salesRepository.findByDay(day)) ?? this.salesRepository.createEmpty(day);
      metric.totalRevenue = Number(metric.totalRevenue) + amount;
      metric.totalTickets = Number(metric.totalTickets) + quantity;

      if (data.ticketTypeId) {
        const ticketMetric =
          (await this.salesTicketRepository.findByDayAndTicket(day, data.ticketTypeId)) ??
          this.salesTicketRepository.createEmpty(day, data.ticketTypeId, data.ticketTypeName ?? undefined);
        ticketMetric.totalRevenue = Number(ticketMetric.totalRevenue) + amount;
        ticketMetric.totalTickets = Number(ticketMetric.totalTickets) + quantity;
        await this.salesTicketRepository.save(ticketMetric);
      }

      return await this.salesRepository.save(metric);
    } catch (error) {
      this.logger.error('No se pudo registrar la compra', error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('No se pudo registrar la compra');
    }
  }

  async listDailySales(options?: { limit?: number; ticketTypeId?: string; organizerId?: string; organizerEmail?: string }) {
    const safeLimit = this.normalizeLimit(options?.limit);
    const ticketTypeId = String(options?.ticketTypeId ?? '').trim();
    try {
      return await this.listDailySalesFromOrders(safeLimit, ticketTypeId || undefined, {
        organizerId: options?.organizerId,
        organizerEmail: options?.organizerEmail,
      });
    } catch (error) {
      this.logger.error('No se pudo listar ventas diarias', error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('No se pudo listar ventas');
    }
  }

  async listSalesHistory(options?: { limit?: number; ticketTypeId?: string; organizerId?: string; organizerEmail?: string }) {
    const safeLimit = this.normalizeLimit(options?.limit);
    const ticketTypeId = String(options?.ticketTypeId ?? '').trim();
    try {
      return await this.listRecentSalesFromOrders(safeLimit, ticketTypeId || undefined, {
        organizerId: options?.organizerId,
        organizerEmail: options?.organizerEmail,
      });
    } catch (error) {
      this.logger.error('No se pudo listar el historial de ventas', error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('No se pudo listar el historial de ventas');
    }
  }

  async getSummary(organizer?: { id?: string; email?: string }) {
    try {
      const params: Array<string | number> = [];
      const filters = [`LOWER(COALESCE(o.status, 'paid')) IN (${PAID_ORDER_STATUSES_SQL})`];
      this.appendOrganizerFilter(filters, params, organizer);
      const orgWhere = filters.join(' AND ');

      const daysTrackedRows = await this.dataSource.query(
        `
          SELECT COUNT(*)::int AS "daysTracked"
          FROM (
            SELECT o.created_at::date AS day
            FROM orders o
            WHERE ${orgWhere}
            GROUP BY o.created_at::date
          ) tracked_days
        `,
        params,
      );

      const todayRows = await this.dataSource.query(
        `
          SELECT
            COALESCE(SUM(o.total_amount), 0)::numeric AS "todayRevenue",
            COALESCE(SUM(o.quantity), 0)::int AS "todayTickets"
          FROM orders o
          WHERE ${orgWhere}
            AND o.created_at::date = CURRENT_DATE
        `,
        params,
      );

      const daysTracked = Number(daysTrackedRows[0]?.daysTracked ?? 0);
      const todayRevenue = Number(todayRows[0]?.todayRevenue ?? 0);
      const todayTickets = Number(todayRows[0]?.todayTickets ?? 0);

      return {
        daysTracked,
        todayRevenue,
        todayTickets,
      };
    } catch (error) {
      this.logger.error('No se pudo obtener el resumen', error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('No se pudo obtener el resumen');
    }
  }

  private appendOrganizerFilter(
    filters: string[],
    params: Array<string | number>,
    organizer?: { id?: string; email?: string },
  ) {
    const organizerId = String(organizer?.id ?? '').trim();
    const organizerEmail = String(organizer?.email ?? '').trim().toLowerCase();
    if (!organizerId && !organizerEmail) {
      return;
    }
    const subFilters: string[] = [];
    if (organizerId) {
      params.push(organizerId);
      subFilters.push(`tt.organizer_id = $${params.length}`);
    }
    if (organizerEmail) {
      params.push(organizerEmail);
      subFilters.push(`LOWER(tt.organizer_email) = $${params.length}`);
    }
    filters.push(
      `o.ticket_type_id IN (
        SELECT tt.id::text FROM ticket_types tt WHERE ${subFilters.join(' OR ')}
      )`,
    );
  }

  private getTodayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  private parseAmount(raw: number) {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Monto invalido');
    }
    return amount;
  }

  private parseQuantity(raw?: number) {
    const quantity = Number(raw ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Cantidad invalida');
    }
    return Math.floor(quantity);
  }

  private normalizeLimit(raw?: number) {
    const limit = Number(raw ?? 30);
    if (!Number.isFinite(limit) || limit <= 0) {
      return 30;
    }
    return Math.max(1, Math.min(Math.floor(limit), 90));
  }

  private async listDailySalesFromOrders(
    limit: number,
    ticketTypeId?: string,
    organizer?: { organizerId?: string; organizerEmail?: string },
  ) {
    const filters = [`LOWER(COALESCE(o.status, 'paid')) IN (${PAID_ORDER_STATUSES_SQL})`];
    const params: Array<string | number> = [];

    if (ticketTypeId) {
      params.push(ticketTypeId);
      filters.push(`o.ticket_type_id = $${params.length}`);
    }

    this.appendOrganizerFilter(filters, params, {
      id: organizer?.organizerId,
      email: organizer?.organizerEmail,
    });

    params.push(limit);
    const limitPlaceholder = `$${params.length}`;

    const rows = (await this.dataSource.query(
      `
        SELECT
          TO_CHAR(o.created_at::date, 'YYYY-MM-DD') AS day,
          COALESCE(SUM(o.total_amount), 0)::numeric AS "totalRevenue",
          COALESCE(SUM(o.quantity), 0)::int AS "totalTickets"
        FROM orders o
        WHERE ${filters.join(' AND ')}
        GROUP BY o.created_at::date
        ORDER BY o.created_at::date DESC
        LIMIT ${limitPlaceholder}
      `,
      params,
    )) as Array<{ day: string; totalRevenue: string | number; totalTickets: string | number }>;

    return rows.map((row) => ({
      day: String(row.day || ''),
      totalRevenue: Number(row.totalRevenue ?? 0),
      totalTickets: Number(row.totalTickets ?? 0),
    }));
  }

  private async listRecentSalesFromOrders(
    limit: number,
    ticketTypeId?: string,
    organizer?: { organizerId?: string; organizerEmail?: string },
  ) {
    const filters = [`LOWER(COALESCE(o.status, 'paid')) IN (${PAID_ORDER_STATUSES_SQL})`];
    const params: Array<string | number> = [];

    if (ticketTypeId) {
      params.push(ticketTypeId);
      filters.push(`o.ticket_type_id = $${params.length}`);
    }

    this.appendOrganizerFilter(filters, params, {
      id: organizer?.organizerId,
      email: organizer?.organizerEmail,
    });

    params.push(limit);
    const limitPlaceholder = `$${params.length}`;

    const rows = (await this.dataSource.query(
      `
        SELECT
          o.id::text AS id,
          TO_CHAR(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt",
          TO_CHAR(o.created_at::date, 'YYYY-MM-DD') AS day,
          COALESCE(NULLIF(o.ticket_type_name, ''), tt.name, 'Ticket') AS "ticketTypeName",
          COALESCE(o.total_amount, 0)::numeric AS "totalRevenue",
          COALESCE(o.quantity, 0)::int AS "totalTickets",
          LOWER(COALESCE(o.status, 'paid')) AS status
        FROM orders o
        LEFT JOIN ticket_types tt ON tt.id::text = o.ticket_type_id::text
        WHERE ${filters.join(' AND ')}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ${limitPlaceholder}
      `,
      params,
    )) as Array<{
      id: string;
      createdAt: string;
      day: string;
      ticketTypeName: string;
      totalRevenue: string | number;
      totalTickets: string | number;
      status: string;
    }>;

    return rows.map((row) => ({
      id: String(row.id || ''),
      createdAt: String(row.createdAt || ''),
      day: String(row.day || ''),
      ticketTypeName: String(row.ticketTypeName || 'Ticket'),
      totalRevenue: Number(row.totalRevenue ?? 0),
      totalTickets: Number(row.totalTickets ?? 0),
      status: String(row.status || 'paid'),
    }));
  }
}
