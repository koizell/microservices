import { Body, Controller, Delete, Get, Header, Param, Post, Query } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { renderNotificationUi } from './notification-ui';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderUi() {
    return renderNotificationUi();
  }

  @Post('data')
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

  @Post('events/ticket-purchased')
  async ingestTicketPurchased(@Body() body: Record<string, unknown>) {
    return await this.notificationService.ingestTicketPurchased(body);
  }

  @Get('campaigns/tickets')
  async getTicketCampaignOptions() {
    return await this.notificationService.getTicketCampaignOptions();
  }

  @Get('campaigns/tickets/:ticketTypeId/audience')
  async getTicketCampaignAudience(
    @Param('ticketTypeId') ticketTypeId: string,
    @Query('includeAdmin') includeAdmin?: string,
  ) {
    const withAdmin = ['true', '1', 'yes'].includes(String(includeAdmin ?? '').toLowerCase());
    return await this.notificationService.getTicketCampaignAudience(ticketTypeId, { includeAdmin: withAdmin });
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
    },
  ) {
    return await this.notificationService.sendTicketCampaign(body);
  }

  @Get('summary')
  async summary() {
    return { total: await this.notificationService.countAll() };
  }

  @Get('data')
  async findAll(@Query('limit') limit?: string) {
    return await this.notificationService.findAll(Number(limit ?? 50));
  }

  @Delete('data/:id')
  async remove(@Param('id') id: string) {
    return await this.notificationService.remove(id);
  }
}
