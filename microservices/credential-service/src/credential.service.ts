import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { In, IsNull, Repository } from 'typeorm';
import { Credential } from './credential.entity';
import { RabbitMqService } from './rabbitmq.service';

type PurchaseCredentialInput = {
  orderItemId: string;
  ticketTypeId: string;
  attendeeName: string;
};

function normalizeServiceBaseUrl(value: string | undefined, fallback: string) {
  const candidate = String(value ?? fallback)
    .trim()
    .replace(/\/+$/, '');

  if (!candidate) {
    return fallback;
  }

  return /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
}

function buildInternalServiceHeaders(headers: Record<string, string> = {}) {
  const normalized = { ...headers, 'x-forwarded-by': 'credential-service' };
  const internalApiKey = String(process.env.INTERNAL_API_KEY ?? '').trim();
  if (internalApiKey) {
    normalized['x-internal-api-key'] = internalApiKey;
  }
  return normalized;
}

@Injectable()
export class CredentialService implements OnModuleInit {
  private readonly logger = new Logger(CredentialService.name);
  private readonly ticketingBaseUrl = normalizeServiceBaseUrl(process.env.TICKETING_SERVICE_URL, 'http://localhost:3002');
  private readonly gatewayBaseUrl = normalizeServiceBaseUrl(
    process.env.GATEWAY_BASE_URL ?? process.env.GATEWAY_URL,
    'http://localhost:3008',
  );

  constructor(
    @InjectRepository(Credential)
    private readonly credentialRepository: Repository<Credential>,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  async onModuleInit() {
    await this.rabbitMqService.consume('ticket.purchased', async (payload) => {
      await this.ingestPurchaseEvent(payload);
    });
  }

  private shouldRetryTicketingThroughGateway(status: number) {
    return this.gatewayBaseUrl !== this.ticketingBaseUrl && (status === 401 || status === 403);
  }

  private normalizePurchaseInput(data: Partial<PurchaseCredentialInput>): PurchaseCredentialInput {
    const orderItemId = String(data.orderItemId ?? '').trim();
    const ticketTypeId = String(data.ticketTypeId ?? '').trim();
    const attendeeName = String(data.attendeeName ?? '').trim();

    if (!orderItemId) {
      throw new BadRequestException('orderItemId es requerido');
    }
    if (!ticketTypeId) {
      throw new BadRequestException('ticketTypeId es requerido');
    }
    if (!attendeeName) {
      throw new BadRequestException('attendeeName es requerido');
    }

    return { orderItemId, ticketTypeId, attendeeName };
  }

  private buildQrRawToken(orderItemId: string) {
    return `eventhive:ticket:${orderItemId}:${randomUUID()}`;
  }

  private async assignNewQrValue(credential: Credential) {
    const rawToken = this.buildQrRawToken(credential.orderItemId);
    credential.qrCodeValue = rawToken;
    credential.qrCodeHash = createHash('sha256').update(rawToken).digest('hex');
    return await this.credentialRepository.save(credential);
  }

  private async createOrReuseCredential(data: PurchaseCredentialInput) {
    const existing = await this.credentialRepository.findOneBy({ orderItemId: data.orderItemId });
    if (existing) {
      const credential = existing.qrCodeValue ? existing : await this.assignNewQrValue(existing);
      return { credential, created: false };
    }

    const rawToken = this.buildQrRawToken(data.orderItemId);
    const qrCodeHash = createHash('sha256').update(rawToken).digest('hex');

    const credential = this.credentialRepository.create({
      ...data,
      qrCodeHash,
      qrCodeValue: rawToken,
      isUsed: false,
      usedAt: null,
      usedBy: null,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
    });

    return {
      credential: await this.credentialRepository.save(credential),
      created: true,
    };
  }

  private getCredentialStatus(credential: Credential): 'VALID' | 'USED' | 'REVOKED' {
    if (credential.revokedAt) {
      return 'REVOKED';
    }
    if (credential.isUsed) {
      return 'USED';
    }
    return 'VALID';
  }

  private getAllowedScanners() {
    return String(process.env.SCANNER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  getStaffScannerContext(requestedScannerId?: string) {
    const preferredScannerId = String(requestedScannerId ?? '').trim();
    const allowedScanners = this.getAllowedScanners();

    if (allowedScanners.length === 0) {
      return {
        scannerId: preferredScannerId || 'gate-mobile',
        scannersRestricted: false,
        allowedScannerCount: 0,
        source: preferredScannerId ? 'requested' : 'generated',
        overridden: false,
      };
    }

    const preferredIsAllowed = preferredScannerId ? allowedScanners.includes(preferredScannerId) : false;
    return {
      scannerId: preferredIsAllowed ? preferredScannerId : allowedScanners[0],
      scannersRestricted: true,
      allowedScannerCount: allowedScanners.length,
      source: preferredIsAllowed ? 'requested' : 'configured',
      overridden: Boolean(preferredScannerId) && !preferredIsAllowed,
    };
  }

  private async getTicketTypeNames(ticketTypeIds: string[]) {
    const normalizedIds = [...new Set(ticketTypeIds.map((value) => String(value || '').trim()).filter(Boolean))];
    if (normalizedIds.length === 0) {
      return new Map<string, string>();
    }

    try {
      let response = await fetch(`${this.ticketingBaseUrl}/tickets/types?includeInactive=true`, {
        headers: buildInternalServiceHeaders({
          Accept: 'application/json',
        }),
      });

      if (!response.ok && this.shouldRetryTicketingThroughGateway(response.status)) {
        this.logger.warn(
          `Falling back to api-gateway for ticket type names after direct ticketing-service failure: ${response.status}`,
        );
        response = await fetch(`${this.gatewayBaseUrl}/tickets/types?includeInactive=true`, {
          headers: buildInternalServiceHeaders({
            Accept: 'application/json',
          }),
        });
      }

      const rawText = await response.text().catch(() => '');
      let payload: unknown = [];

      try {
        payload = rawText ? JSON.parse(rawText) : [];
      } catch {
        payload = [];
      }

      if (!response.ok || !Array.isArray(payload)) {
        this.logger.warn(`No se pudieron resolver nombres de tipos de ticket: ticketing-service respondio ${response.status}`);
        return new Map<string, string>();
      }

      const validIds = new Set(normalizedIds);
      const names = new Map<string, string>();
      for (const item of payload) {
        if (!item || typeof item !== 'object') {
          continue;
        }

        const ticketTypeId = String((item as { id?: unknown }).id ?? '').trim();
        const ticketTypeName = String((item as { name?: unknown }).name ?? '').trim();
        if (!ticketTypeId || !ticketTypeName || !validIds.has(ticketTypeId)) {
          continue;
        }

        names.set(ticketTypeId, ticketTypeName);
      }

      return names;
    } catch (error) {
      this.logger.warn(`No se pudieron resolver nombres de tipos de ticket: ${error instanceof Error ? error.message : String(error)}`);
      return new Map<string, string>();
    }
  }

  private async buildQrCodeDataUrl(qrCodeValue: string | null | undefined) {
    if (!qrCodeValue) {
      return null;
    }

    try {
      return await QRCode.toDataURL(qrCodeValue, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 280,
      });
    } catch (error) {
      this.logger.warn(`No se pudo generar imagen QR: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private toResponse(
    credential: Credential,
    options: {
      includeQrCodeHash?: boolean;
      includeQrCodeValue?: boolean;
      qrCodeDataUrl?: string | null;
      ticketTypeName?: string;
    } = {},
  ) {
    return {
      id: credential.id,
      credentialId: credential.id,
      ticketId: credential.orderItemId,
      orderItemId: credential.orderItemId,
      ticketTypeId: credential.ticketTypeId,
      ticketTypeName: options.ticketTypeName || credential.ticketTypeId,
      attendeeName: credential.attendeeName,
      isUsed: credential.isUsed,
      usedAt: credential.usedAt,
      usedBy: credential.usedBy,
      createdAt: credential.createdAt,
      revokedAt: credential.revokedAt,
      revokedBy: credential.revokedBy,
      revokeReason: credential.revokeReason,
      ...(options.includeQrCodeValue ? { qrCodeValue: credential.qrCodeValue } : {}),
      ...(options.includeQrCodeHash ? { qrCodeHash: credential.qrCodeHash } : {}),
      ...(typeof options.qrCodeDataUrl !== 'undefined' ? { qrCodeDataUrl: options.qrCodeDataUrl } : {}),
      status: this.getCredentialStatus(credential),
    };
  }

  private async buildCredentialResponses(
    credentials: Credential[],
    options: {
      includeQrCodeHash?: boolean;
      includeQrCodeValue?: boolean;
      includeQrCodeImage?: boolean;
    } = {},
  ) {
    if (credentials.length === 0) {
      return [];
    }

    const ticketTypeNames = await this.getTicketTypeNames(credentials.map((credential) => credential.ticketTypeId));

    return await Promise.all(
      credentials.map(async (credential) => {
        const qrCodeDataUrl = options.includeQrCodeImage
          ? await this.buildQrCodeDataUrl(credential.qrCodeValue)
          : undefined;

        return this.toResponse(credential, {
          includeQrCodeHash: options.includeQrCodeHash,
          includeQrCodeValue: options.includeQrCodeValue,
          qrCodeDataUrl,
          ticketTypeName: ticketTypeNames.get(credential.ticketTypeId) || credential.ticketTypeId,
        });
      }),
    );
  }

  private async buildCredentialResponse(
    credential: Credential,
    options: {
      includeQrCodeHash?: boolean;
      includeQrCodeValue?: boolean;
      includeQrCodeImage?: boolean;
    } = {},
  ) {
    const [response] = await this.buildCredentialResponses([credential], options);
    return response;
  }

  private async getOwnedOrderItemIds(authorization: string) {
    const normalizedAuthorization = String(authorization ?? '').trim();
    if (!normalizedAuthorization.startsWith('Bearer ')) {
      throw new BadRequestException('Token requerido para consultar credenciales del usuario');
    }

    let response = await fetch(`${this.ticketingBaseUrl}/tickets/orders?limit=100`, {
      headers: buildInternalServiceHeaders({
        Accept: 'application/json',
        Authorization: normalizedAuthorization,
      }),
    });

    if (!response.ok && this.shouldRetryTicketingThroughGateway(response.status)) {
      this.logger.warn(
        `Falling back to api-gateway for owned ticket orders after direct ticketing-service failure: ${response.status}`,
      );
      response = await fetch(`${this.gatewayBaseUrl}/tickets/orders?limit=100`, {
        headers: buildInternalServiceHeaders({
          Accept: 'application/json',
          Authorization: normalizedAuthorization,
        }),
      });
    }

    const rawText = await response.text().catch(() => '');
    let payload: unknown = [];

    try {
      payload = rawText ? JSON.parse(rawText) : [];
    } catch {
      payload = { message: rawText };
    }

    if (!response.ok) {
      const reason = typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message?: unknown }).message ?? 'Error desconocido')
        : `ticketing-service respondio ${response.status}`;
      this.logger.warn(`No se pudieron resolver ordenes del usuario para credenciales: ${reason}`);
      throw new BadRequestException(reason);
    }

    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((order) => (typeof order === 'object' && order ? String((order as { ticketId?: unknown }).ticketId ?? '').trim() : ''))
      .filter(Boolean);
  }

  async ingestPurchaseEvent(payload: Partial<PurchaseCredentialInput>) {
    const normalized = this.normalizePurchaseInput(payload);
    const { credential, created } = await this.createOrReuseCredential(normalized);

    if (created) {
      await this.rabbitMqService.publish('qr.generated', {
        credentialId: credential.id,
        orderItemId: credential.orderItemId,
        ticketTypeId: credential.ticketTypeId,
        attendeeName: credential.attendeeName,
        qrCodeHash: credential.qrCodeHash,
        createdAt: credential.createdAt,
      });
    }

    return {
      ok: true,
      created,
      credential: await this.buildCredentialResponse(credential, { includeQrCodeHash: true, includeQrCodeValue: true }),
    };
  }

  async createFromPurchase(data: PurchaseCredentialInput) {
    const { credential } = await this.createOrReuseCredential(this.normalizePurchaseInput(data));
    return await this.buildCredentialResponse(credential, { includeQrCodeHash: true, includeQrCodeValue: true });
  }

  async findAll(limit = 50) {
    const credentials = await this.credentialRepository.find({
      order: { createdAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    return await this.buildCredentialResponses(credentials, { includeQrCodeHash: true, includeQrCodeValue: true });
  }

  async getCredentialsForAuthorization(authorization: string) {
    const orderItemIds = await this.getOwnedOrderItemIds(authorization);
    if (orderItemIds.length === 0) {
      return [];
    }

    const credentials = await this.credentialRepository.find({
      where: { orderItemId: In(orderItemIds) },
      order: { createdAt: 'DESC' },
    });

    return await this.buildCredentialResponses(credentials, { includeQrCodeValue: true, includeQrCodeImage: true });
  }

  async countAll(): Promise<number> {
    return await this.credentialRepository.count();
  }

  async getOperationalStatus() {
    const [totalCredentials, usedCount, legacyWithoutQr, revokedRows] = await Promise.all([
      this.countAll(),
      this.credentialRepository.countBy({ isUsed: true }),
      this.credentialRepository.countBy({ qrCodeValue: IsNull() }),
      this.credentialRepository
        .createQueryBuilder('credential')
        .where('credential.revokedAt IS NOT NULL')
        .getCount(),
    ]);
    const rabbitmq = this.rabbitMqService.getStatus();
    const allowedScanners = this.getAllowedScanners();
    const validCount = Math.max(totalCredentials - usedCount - revokedRows, 0);

    return {
      service: 'credential-service',
      status: rabbitmq.connected ? 'ok' : 'degraded',
      totalCredentials,
      validCount,
      usedCount,
      revokedCount: revokedRows,
      legacyWithoutQr,
      rabbitmq,
      scannersRestricted: allowedScanners.length > 0,
      allowedScannerCount: allowedScanners.length,
    };
  }

  async validateQr(qrCodeHash: string, scannerId: string) {
    const qrValue = String(qrCodeHash || '').trim();
    const scanner = (scannerId || '').trim();
    const allowedScanners = this.getAllowedScanners();
    if (!qrValue) {
      return { valid: false, status: 'INVALID', reason: 'QR no especificado' };
    }
    if (!scanner) {
      return { valid: false, status: 'INVALID', reason: 'Scanner no especificado' };
    }

    if (allowedScanners.length > 0 && !allowedScanners.includes(scanner)) {
      return {
        valid: false,
        status: 'INVALID',
        reason: 'Scanner no autorizado',
      };
    }

    const credential = await this.credentialRepository.findOne({
      where: [{ qrCodeHash: qrValue }, { qrCodeValue: qrValue }],
    });

    if (!credential) {
      return { valid: false, status: 'INVALID', reason: 'Credential no encontrada' };
    }

    const ticketTypeNames = await this.getTicketTypeNames([credential.ticketTypeId]);
    const ticketTypeName = ticketTypeNames.get(credential.ticketTypeId) || credential.ticketTypeId;

    if (credential.revokedAt) {
      return {
        valid: false,
        status: 'REVOKED',
        reason: credential.revokeReason || 'Credential revocada',
        ticketTypeId: credential.ticketTypeId,
        ticketTypeName,
        ticketId: credential.orderItemId,
        credentialId: credential.id,
        revokedAt: credential.revokedAt,
        revokedBy: credential.revokedBy,
      };
    }

    if (credential.isUsed) {
      return {
        valid: false,
        status: 'USED',
        reason: 'Credential ya utilizada',
        ticketTypeId: credential.ticketTypeId,
        ticketTypeName,
        ticketId: credential.orderItemId,
        credentialId: credential.id,
        usedAt: credential.usedAt,
        usedBy: credential.usedBy,
      };
    }

    const checkinAt = new Date();
    const updateResult = await this.credentialRepository.update(
      { id: credential.id, isUsed: false, revokedAt: IsNull() },
      { isUsed: true, usedAt: checkinAt, usedBy: scanner },
    );

    if ((updateResult.affected ?? 0) !== 1) {
      const latest = await this.credentialRepository.findOneBy({ id: credential.id });

      if (!latest) {
        return { valid: false, status: 'INVALID', reason: 'Credential no encontrada' };
      }

      if (latest.revokedAt) {
        return {
          valid: false,
          status: 'REVOKED',
          reason: latest.revokeReason || 'Credential revocada',
          ticketTypeId: latest.ticketTypeId,
          ticketTypeName,
          ticketId: latest.orderItemId,
          credentialId: latest.id,
          revokedAt: latest.revokedAt,
          revokedBy: latest.revokedBy,
        };
      }

      if (latest.isUsed) {
        return {
          valid: false,
          status: 'USED',
          reason: 'Credential ya utilizada',
          ticketTypeId: latest.ticketTypeId,
          ticketTypeName,
          ticketId: latest.orderItemId,
          credentialId: latest.id,
          usedAt: latest.usedAt,
          usedBy: latest.usedBy,
        };
      }

      return {
        valid: false,
        status: 'INVALID',
        reason: 'No se pudo confirmar la validacion en tiempo real',
      };
    }

    const saved = await this.credentialRepository.findOneBy({ id: credential.id });
    if (!saved) {
      return { valid: false, status: 'INVALID', reason: 'Credential no encontrada' };
    }

    await this.rabbitMqService.publish('checkin.processed', {
      credentialId: saved.id,
      orderItemId: saved.orderItemId,
      ticketTypeId: saved.ticketTypeId,
      attendeeName: saved.attendeeName,
      usedAt: saved.usedAt,
      usedBy: saved.usedBy,
    });

    return {
      valid: true,
      status: 'USED',
      checkinAt: saved.usedAt,
      attendeeName: saved.attendeeName,
      credentialId: saved.id,
      ticketId: saved.orderItemId,
      ticketTypeId: saved.ticketTypeId,
      ticketTypeName,
      usedBy: saved.usedBy,
    };
  }

  async revokeCredential(id: string, revokedBy: string, reason?: string) {
    const credential = await this.credentialRepository.findOneBy({ id });
    if (!credential) {
      return null;
    }

    if (credential.revokedAt) {
      return {
        ok: false,
        reason: 'La credencial ya estaba revocada',
        credential: await this.buildCredentialResponse(credential, { includeQrCodeHash: true, includeQrCodeValue: true }),
      };
    }

    if (credential.isUsed) {
      return {
        ok: false,
        reason: 'No se puede revocar una credencial ya utilizada',
        credential: await this.buildCredentialResponse(credential, { includeQrCodeHash: true, includeQrCodeValue: true }),
      };
    }

    credential.revokedAt = new Date();
    credential.revokedBy = (revokedBy || '').trim() || 'admin-panel';
    credential.revokeReason = (reason || '').trim() || 'Revocacion manual';
    const saved = await this.credentialRepository.save(credential);

    await this.rabbitMqService.publish('credential.revoked', {
      credentialId: saved.id,
      orderItemId: saved.orderItemId,
      ticketTypeId: saved.ticketTypeId,
      revokedAt: saved.revokedAt,
      revokedBy: saved.revokedBy,
      revokeReason: saved.revokeReason,
    });

    return {
      ok: true,
      credential: await this.buildCredentialResponse(saved, { includeQrCodeHash: true, includeQrCodeValue: true }),
    };
  }

  async repairLegacyCredentials(limit = 50) {
    const credentials = await this.credentialRepository.find({
      where: { qrCodeValue: IsNull() },
      order: { createdAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 200)),
    });

    const repairedCredentials: Credential[] = [];
    for (const credential of credentials) {
      const saved = await this.assignNewQrValue(credential);
      repairedCredentials.push(saved);
    }

    const repaired = await this.buildCredentialResponses(repairedCredentials, { includeQrCodeHash: true, includeQrCodeValue: true });

    return {
      ok: true,
      repairedCount: repaired.length,
      credentials: repaired,
    };
  }

  async getCredentialById(id: string) {
    const credential = await this.credentialRepository.findOneBy({ id });
    return credential ? await this.buildCredentialResponse(credential, { includeQrCodeHash: true, includeQrCodeValue: true, includeQrCodeImage: true }) : null;
  }
}
