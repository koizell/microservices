import { Injectable, Logger } from '@nestjs/common';
import { lookup } from 'dns';
import { connect as connectSocket, isIP, Socket } from 'net';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import SMTPTransport = require('nodemailer/lib/smtp-transport');

function normalizeSecret(value: string | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, '');
}

function normalizeTimeout(value: number | string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveSmtpIpFamily(host: string) {
  if (!host || isIP(host)) {
    return 0;
  }

  const configuredFamily = String(process.env.SMTP_IP_FAMILY ?? '4').trim().toLowerCase();
  if (configuredFamily === 'auto' || configuredFamily === '0') {
    return 0;
  }

  return configuredFamily === '6' ? 6 : 4;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  async sendVerificationEmail(params: {
    to: string;
    name: string;
    confirmationUrl: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    return await this.sendEmail({
      to: params.to,
      subject: 'Confirma tu cuenta de EventHive',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto">
          <h2 style="margin-bottom:12px">Activa tu cuenta de EventHive</h2>
          <p>Hola ${this.escapeHtml(params.name)},</p>
          <p>Tu cuenta fue creada correctamente. Para activarla, confirma tu correo con el siguiente boton:</p>
          <p style="margin:24px 0">
            <a href="${params.confirmationUrl}" style="display:inline-block;background:#e85d04;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">Confirmar cuenta</a>
          </p>
          <p>Si el boton no funciona, copia y pega este enlace en tu navegador:</p>
          <p style="word-break:break-all;color:#c2410c">${params.confirmationUrl}</p>
          <p>Este enlace expira en 24 horas.</p>
        </div>
      `,
      text: [
        'Activa tu cuenta de EventHive',
        `Hola ${params.name},`,
        'Confirma tu correo abriendo este enlace:',
        params.confirmationUrl,
        'Este enlace expira en 24 horas.',
      ].join('\n'),
      missingSmtpLog: `SMTP no configurado. Enlace de confirmacion para ${params.to}: ${params.confirmationUrl}`,
      errorLog: `Fallo al enviar correo de verificacion a ${params.to}`,
    });
  }

  async sendPasswordResetEmail(params: {
    to: string;
    name: string;
    resetUrl: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    return await this.sendEmail({
      to: params.to,
      subject: 'Restablece tu contrasena de EventHive',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto">
          <h2 style="margin-bottom:12px">Restablece tu contrasena</h2>
          <p>Hola ${this.escapeHtml(params.name)},</p>
          <p>Recibimos una solicitud para cambiar la contrasena de tu cuenta. Usa el siguiente enlace para establecer una nueva contrasena:</p>
          <p style="margin:24px 0">
            <a href="${params.resetUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">Restablecer contrasena</a>
          </p>
          <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
          <p>Si el boton no funciona, copia y pega este enlace en tu navegador:</p>
          <p style="word-break:break-all;color:#1d4ed8">${params.resetUrl}</p>
          <p>Este enlace expira en 60 minutos.</p>
        </div>
      `,
      text: [
        'Restablece tu contrasena de EventHive',
        `Hola ${params.name},`,
        'Abre este enlace para establecer una nueva contrasena:',
        params.resetUrl,
        'Este enlace expira en 60 minutos.',
      ].join('\n'),
      missingSmtpLog: `SMTP no configurado. Enlace de restablecimiento para ${params.to}: ${params.resetUrl}`,
      errorLog: `Fallo al enviar correo de restablecimiento a ${params.to}`,
    });
  }

  async sendPurchaseConfirmation(params: {
    to: string;
    orderId: string;
    ticketTypeName?: string;
    quantity?: number;
    amount?: number;
  }): Promise<{ sent: boolean; reason?: string }> {
    const ticketLabel = params.ticketTypeName || 'ticket';
    const quantity = Number(params.quantity || 1);
    const amount = Number(params.amount || 0).toFixed(2);
    return await this.sendEmail({
      to: params.to,
      subject: 'Confirmacion de compra EventHive',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto">
          <h2 style="margin-bottom:12px">Tu compra fue confirmada</h2>
          <p>Hemos registrado correctamente tu compra en EventHive.</p>
          <ul style="padding-left:18px">
            <li><strong>Orden:</strong> ${this.escapeHtml(params.orderId)}</li>
            <li><strong>Tipo de ticket:</strong> ${this.escapeHtml(ticketLabel)}</li>
            <li><strong>Cantidad:</strong> ${quantity}</li>
            <li><strong>Total:</strong> $${amount}</li>
          </ul>
          <p>Conserva este correo como comprobante. Tu credencial y notificaciones posteriores se emitiran en los siguientes pasos del flujo.</p>
        </div>
      `,
      text: [
        'Tu compra fue confirmada en EventHive.',
        `Orden: ${params.orderId}`,
        `Tipo de ticket: ${ticketLabel}`,
        `Cantidad: ${quantity}`,
        `Total: $${amount}`,
      ].join('\n'),
      missingSmtpLog: `SMTP no configurado. Confirmacion de compra para ${params.to}. Orden ${params.orderId}`,
      errorLog: `Fallo al enviar confirmacion de compra a ${params.to}`,
    });
  }

  async sendOrganizerSaleAlert(params: {
    to: string;
    organizerName?: string;
    orderId: string;
    ticketTypeName?: string;
    quantity?: number;
    amount?: number;
    buyerEmail?: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    const organizerLabel = params.organizerName || 'organizador';
    const ticketLabel = params.ticketTypeName || 'ticket';
    const quantity = Number(params.quantity || 1);
    const amount = Number(params.amount || 0).toFixed(2);

    return await this.sendEmail({
      to: params.to,
      subject: 'Nueva venta registrada en EventHive',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto">
          <h2 style="margin-bottom:12px">Nueva venta para tu operacion</h2>
          <p>Hola ${this.escapeHtml(organizerLabel)},</p>
          <p>Se registró una nueva venta en EventHive.</p>
          <ul style="padding-left:18px">
            <li><strong>Orden:</strong> ${this.escapeHtml(params.orderId)}</li>
            <li><strong>Ticket vendido:</strong> ${this.escapeHtml(ticketLabel)}</li>
            <li><strong>Cantidad:</strong> ${quantity}</li>
            <li><strong>Total:</strong> $${amount}</li>
            <li><strong>Comprador:</strong> ${this.escapeHtml(params.buyerEmail || 'sin correo')}</li>
          </ul>
        </div>
      `,
      text: [
        'Nueva venta para tu operacion.',
        `Orden: ${params.orderId}`,
        `Ticket vendido: ${ticketLabel}`,
        `Cantidad: ${quantity}`,
        `Total: $${amount}`,
        `Comprador: ${params.buyerEmail || 'sin correo'}`,
      ].join('\n'),
      missingSmtpLog: `SMTP no configurado. Alerta de venta para ${params.to}. Orden ${params.orderId}`,
      errorLog: `Fallo al enviar alerta de venta a ${params.to}`,
    });
  }

  async sendTicketCampaignEmail(params: {
    to: string;
    recipientName?: string;
    organizerName?: string;
    subject: string;
    message: string;
    ticketTypeName: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    const recipientLabel = params.recipientName || 'asistente';
    const organizerLabel = params.organizerName || 'tu organizador';
    const safeSubject = String(params.subject || '').trim();
    const safeMessage = String(params.message || '').trim();
    const safeTicketTypeName = String(params.ticketTypeName || 'ticket').trim();

    return await this.sendEmail({
      to: params.to,
      subject: safeSubject,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto">
          <h2 style="margin-bottom:12px">${this.escapeHtml(safeSubject)}</h2>
          <p>Hola ${this.escapeHtml(recipientLabel)},</p>
          <p>Te compartimos una notificacion relacionada con tu compra de <strong>${this.escapeHtml(safeTicketTypeName)}</strong>.</p>
          <div style="margin:20px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #dbeafe;color:#0f172a">${this.formatMultilineHtml(safeMessage)}</div>
          <p style="color:#475569">Mensaje enviado por ${this.escapeHtml(organizerLabel)} desde EventHive.</p>
        </div>
      `,
      text: [
        safeSubject,
        `Hola ${recipientLabel},`,
        `Notificacion sobre tu compra de ${safeTicketTypeName}:`,
        safeMessage,
        `Mensaje enviado por ${organizerLabel} desde EventHive.`,
      ].join('\n\n'),
      missingSmtpLog: `SMTP no configurado. Campana para ${params.to}. Ticket ${safeTicketTypeName}`,
      errorLog: `Fallo al enviar campana personalizada a ${params.to}`,
    });
  }

  private async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
    missingSmtpLog: string;
    errorLog: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn(params.missingSmtpLog);
      return { sent: false, reason: 'SMTP no configurado' };
    }

    try {
      await transporter.sendMail({
        from: this.getSenderAddress(),
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      return { sent: true };
    } catch (error) {
      const reason = this.getMailErrorReason(error);
      this.logger.error(`${params.errorLog}: ${reason}`);
      return { sent: false, reason };
    }
  }

  private getTransporter(): Transporter | null {
    if (this.transporter) {
      return this.transporter;
    }

    const smtpHost = String(process.env.SMTP_HOST ?? '').trim();
    const smtpUser = String(process.env.SMTP_USER ?? '').trim();
    const smtpPass = normalizeSecret(process.env.SMTP_PASS);
    const smtpPort = Number(process.env.SMTP_PORT ?? 587);
    const secure = process.env.SMTP_SECURE === 'true';
    const connectionTimeout = normalizeTimeout(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10000);
    const greetingTimeout = normalizeTimeout(process.env.SMTP_GREETING_TIMEOUT_MS, 10000);
    const socketTimeout = normalizeTimeout(process.env.SMTP_SOCKET_TIMEOUT_MS, 15000);

    if (smtpHost && smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure,
        requireTLS: !secure,
        connectionTimeout,
        greetingTimeout,
        socketTimeout,
        tls: isIP(smtpHost) ? undefined : { servername: smtpHost },
        getSocket: this.createSmtpSocketFactory(),
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      return this.transporter;
    }

    const gmailUser = String(process.env.GMAIL_USER ?? '').trim();
    const gmailAppPassword = normalizeSecret(process.env.GMAIL_APP_PASSWORD);
    if (gmailUser && gmailAppPassword) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        connectionTimeout,
        greetingTimeout,
        socketTimeout,
        auth: {
          user: gmailUser,
          pass: gmailAppPassword,
        },
      });
      return this.transporter;
    }

    return null;
  }

  private createSmtpSocketFactory(): SMTPTransport.Options['getSocket'] {
    return (options, callback) => {
      const host = String(options.host ?? '').trim();
      const preferredFamily = resolveSmtpIpFamily(host);

      if (!host || preferredFamily === 0) {
        callback(null, false);
        return;
      }

      lookup(host, { family: preferredFamily }, (lookupError, address) => {
        if (lookupError || !address) {
          this.logger.warn(
            `No se pudo resolver ${host} por IPv${preferredFamily}. Nodemailer usara la resolucion por defecto.`,
          );
          callback(null, false);
          return;
        }

        const port = Number(options.port ?? 587);
        const timeoutMs = normalizeTimeout(options.connectionTimeout, 10000);
        const socket = connectSocket({
          host: address,
          port,
          family: preferredFamily,
          localAddress: options.localAddress,
        });

        let finished = false;
        const cleanup = () => {
          clearTimeout(timer);
          socket.removeListener('connect', handleConnect);
          socket.removeListener('error', handleError);
        };
        const finish = (error: Error | null, socketOptions?: { connection: Socket }) => {
          if (finished) {
            return;
          }

          finished = true;
          cleanup();

          if (error) {
            if (!socket.destroyed) {
              socket.destroy();
            }
            callback(error, false);
            return;
          }

          callback(null, socketOptions ?? false);
        };
        const handleConnect = () => {
          this.logger.log(`SMTP conectado por IPv${preferredFamily} a ${host} (${address}:${port})`);
          finish(null, { connection: socket });
        };
        const handleError = (error: Error) => {
          finish(error);
        };
        const timer = setTimeout(() => {
          finish(new Error(`Timeout conectando al servidor SMTP ${host} por IPv${preferredFamily}`));
        }, timeoutMs);

        timer.unref?.();
        socket.once('connect', handleConnect);
        socket.once('error', handleError);
      });
    };
  }

  private getSenderAddress() {
    return (
      process.env.EMAIL_FROM ??
      process.env.SMTP_USER ??
      process.env.GMAIL_USER ??
      'no-reply@eventhive.local'
    );
  }

  private formatMultilineHtml(value: string) {
    return this.escapeHtml(value).replace(/\n/g, '<br>');
  }

  private escapeHtml(value: string) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getMailErrorReason(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'No se pudo enviar el correo';
    }

    const message = error.message.toLowerCase();
    if (message.includes('invalid login') || message.includes('authentication unsuccessful')) {
      return 'Credenciales SMTP invalidas';
    }
    if (
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('enetunreach') ||
      message.includes('ehostunreach')
    ) {
      return 'No se pudo conectar al servidor SMTP';
    }

    return `Error SMTP: ${error.message}`;
  }
}
