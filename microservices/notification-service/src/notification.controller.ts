import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query, Redirect, Req, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Roles } from './decorators/roles.decorator';
import { RoleGuard } from './guards/role.guard';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('health')
  status() {
    return { service: 'notification-service', status: 'ok' };
  }

  @Get()
  @Redirect()
  redirectToFrontend(@Req() req: any) {
    const baseUrl = String(process.env.FRONTEND_URL || 'http://localhost:3009').trim().replace(/\/+$/, '');
    const target = new URL('/?panel=notificaciones', baseUrl).toString();
    return { url: target };
  }

  @Post('data')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async create(@Body() notification: { message: string; recipient: string; read?: boolean }) {
    return await this.notificationService.create({
      message: notification.message,
      recipient: notification.recipient,
      read: notification.read ?? false,
    });
  }

  @Post('email/account-confirmation')
  async sendAccountConfirmation(
    @Body() body: { to: string; name: string; confirmationUrl: string },
  ) {
    return await this.notificationService.sendAccountConfirmationEmail(body);
  }

  @Post('email/password-reset')
  async sendPasswordReset(
    @Body() body: { to: string; name: string; resetUrl: string },
  ) {
    return await this.notificationService.sendPasswordResetEmail(body);
  }

  @Post('email/password-change-confirm')
  async sendPasswordChangeConfirm(
    @Body() body: { to: string; name: string; changeUrl: string },
  ) {
    return await this.notificationService.sendPasswordChangeConfirmEmail(body);
  }

  @Post('events/ticket-purchased')
  async ingestTicketPurchased(@Body() body: Record<string, unknown>) {
    return await this.notificationService.ingestTicketPurchased(body);
  }

  @Get('campaigns/tickets')
  async getTicketCampaignOptions(
    @Query('organizerId') organizerId?: string,
    @Query('organizerEmail') organizerEmail?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const withInactive = ['true', '1', 'yes'].includes(String(includeInactive ?? '').toLowerCase());
    return await this.notificationService.getTicketCampaignOptions({
      organizerId,
      organizerEmail,
      includeInactive: withInactive,
    });
  }

  @Get('campaigns/tickets/:ticketTypeId/audience')
  async getTicketCampaignAudience(
    @Param('ticketTypeId') ticketTypeId: string,
    @Query('includeAdmin') includeAdmin?: string,
    @Query('organizerId') organizerId?: string,
    @Query('organizerEmail') organizerEmail?: string,
  ) {
    const withAdmin = ['true', '1', 'yes'].includes(String(includeAdmin ?? '').toLowerCase());
    return await this.notificationService.getTicketCampaignAudience(ticketTypeId, {
      includeAdmin: withAdmin,
      organizerId,
      organizerEmail,
    });
  }

  @Post('campaigns/tickets/send')
  async sendTicketCampaign(
    @Body()
    body: {
      ticketTypeId: string;
      subject: string;
      message: string;
      senderName?: string;
      includeAdmin?: boolean | string;
      simulate?: boolean | string;
      testRecipients?: string[] | string;
      organizerId?: string;
      organizerEmail?: string;
    },
  ) {
    return await this.notificationService.sendTicketCampaign(body);
  }

  @Get('summary')
  async summary() {
    return { total: await this.notificationService.countAll() };
  }

  @Get('data')
  @UseGuards(RoleGuard)
  @Roles('standard', 'admin')
  async findAll(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('recipient') recipient?: string,
  ) {
    const role = String(req.user?.accountType || req.user?.role || 'guest').toLowerCase();
    const requesterEmail = String(req.user?.email || '').trim().toLowerCase();
    if (role !== 'admin') {
      if (!requesterEmail) {
        throw new ForbiddenException('No se pudo identificar al usuario');
      }
      const requestedRecipient = String(recipient || '').trim().toLowerCase();
      if (requestedRecipient && requestedRecipient !== requesterEmail) {
        throw new ForbiddenException('No puedes consultar notificaciones de otro usuario');
      }
      return await this.notificationService.findAll(Number(limit ?? 50), requesterEmail);
    }
    return await this.notificationService.findAll(Number(limit ?? 50), recipient);
  }

  @Delete('data/:id')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.notificationService.remove(id);
  }
}
