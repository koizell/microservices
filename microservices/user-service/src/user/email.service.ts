import { Injectable, Logger } from '@nestjs/common';

function normalizeServiceBaseUrl(value: string | undefined, fallback: string) {
  const candidate = String(value ?? fallback)
    .trim()
    .replace(/\/+$/, '');

  if (!candidate) {
    return fallback;
  }

  return /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerificationEmail(params: {
    to: string;
    name: string;
    confirmationUrl: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    return await this.postNotification('/notifications/email/account-confirmation', params);
  }

  async sendPasswordResetEmail(params: {
    to: string;
    name: string;
    resetUrl: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    return await this.postNotification('/notifications/email/password-reset', params);
  }

  private getNotificationServiceBaseUrl() {
    return normalizeServiceBaseUrl(process.env.NOTIFICATION_SERVICE_URL, 'http://localhost:3003');
  }

  private async postNotification(path: string, payload: Record<string, unknown>) {
    try {
      const response = await fetch(this.getNotificationServiceBaseUrl() + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(function() {
        return {} as { message?: string; reason?: string; sent?: boolean };
      });

      if (!response.ok) {
        const reason = body.reason || body.message || `notification-service respondio ${response.status}`;
        this.logger.error(`No se pudo delegar el correo en notification-service: ${reason}`);
        return { sent: false, reason };
      }

      return {
        sent: Boolean(body.sent),
        reason: body.reason,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'notification-service no disponible';
      this.logger.error(`No se pudo contactar notification-service: ${reason}`);
      return { sent: false, reason };
    }
  }
}
