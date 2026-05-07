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

function buildServiceBaseUrlCandidates(value: string | undefined, fallback: string) {
  const rawCandidate = String(value ?? '').trim().replace(/\/+$/, '');
  const candidates = new Set<string>();

  if (rawCandidate) {
    candidates.add(normalizeServiceBaseUrl(rawCandidate, fallback));

    if (!/^https?:\/\//i.test(rawCandidate)) {
      const host = rawCandidate.split(':')[0]?.trim();
      if (host && /^eventhive-[a-z0-9-]+$/i.test(host)) {
        candidates.add(`https://${host}.onrender.com`);
      }
    }
  }

  candidates.add(normalizeServiceBaseUrl(undefined, fallback));
  return [...candidates];
}

function buildInternalServiceHeaders(headers: Record<string, string> = {}) {
  const normalized = { ...headers, 'x-forwarded-by': 'user-service' };
  const internalApiKey = String(process.env.INTERNAL_API_KEY ?? '').trim();
  if (internalApiKey) {
    normalized['x-internal-api-key'] = internalApiKey;
  }
  return normalized;
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

  async sendPasswordChangeConfirmEmail(params: {
    to: string;
    name: string;
    changeUrl: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    return await this.postNotification('/notifications/email/password-change-confirm', params);
  }

  private getNotificationServiceBaseUrls() {
    return buildServiceBaseUrlCandidates(process.env.NOTIFICATION_SERVICE_URL, 'http://localhost:3003');
  }

  private async postNotification(path: string, payload: Record<string, unknown>) {
    const attemptedReasons: string[] = [];

    for (const baseUrl of this.getNotificationServiceBaseUrls()) {
      try {
        const response = await fetch(baseUrl + path, {
          method: 'POST',
          headers: buildInternalServiceHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(payload),
        });

        const body = await response.json().catch(function() {
          return {} as { message?: string; reason?: string; sent?: boolean };
        });

        if (!response.ok) {
          const reason = body.reason || body.message || `notification-service respondio ${response.status}`;
          attemptedReasons.push(`${baseUrl}: ${reason}`);
          continue;
        }

        return {
          sent: Boolean(body.sent),
          reason: body.reason,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'notification-service no disponible';
        attemptedReasons.push(`${baseUrl}: ${reason}`);
      }
    }

    const reason = attemptedReasons.join(' | ') || 'notification-service no disponible';
    this.logger.error(`No se pudo delegar el correo en notification-service: ${reason}`);
    return { sent: false, reason };
  }
}
