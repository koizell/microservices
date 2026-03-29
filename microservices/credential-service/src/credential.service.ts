import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { Credential } from './credential.entity';
import { RabbitMqService } from './rabbitmq.service';

type PurchaseCredentialInput = {
  orderItemId: string;
  ticketTypeId: string;
  attendeeName: string;
};

@Injectable()
export class CredentialService implements OnModuleInit {
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
    return `${orderItemId}:${randomUUID()}:${Date.now()}`;
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

  private toResponse(credential: Credential) {
    return {
      ...credential,
      status: this.getCredentialStatus(credential),
    };
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
      credential: this.toResponse(credential),
    };
  }

  async createFromPurchase(data: PurchaseCredentialInput): Promise<Credential> {
    return (await this.createOrReuseCredential(this.normalizePurchaseInput(data))).credential;
  }

  async findAll(limit = 50) {
    const credentials = await this.credentialRepository.find({
      order: { createdAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    return credentials.map((credential) => this.toResponse(credential));
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

    if (credential.revokedAt) {
      return {
        valid: false,
        status: 'REVOKED',
        reason: credential.revokeReason || 'Credential revocada',
        revokedAt: credential.revokedAt,
        revokedBy: credential.revokedBy,
      };
    }

    if (credential.isUsed) {
      return {
        valid: false,
        status: 'USED',
        reason: 'Credential ya utilizada',
        usedAt: credential.usedAt,
        usedBy: credential.usedBy,
      };
    }

    credential.isUsed = true;
    credential.usedAt = new Date();
    credential.usedBy = scanner;

    await this.credentialRepository.save(credential);

    await this.rabbitMqService.publish('checkin.processed', {
      credentialId: credential.id,
      orderItemId: credential.orderItemId,
      ticketTypeId: credential.ticketTypeId,
      attendeeName: credential.attendeeName,
      usedAt: credential.usedAt,
      usedBy: credential.usedBy,
    });

    return {
      valid: true,
      status: 'USED',
      checkinAt: credential.usedAt,
      attendeeName: credential.attendeeName,
      credentialId: credential.id,
      usedBy: credential.usedBy,
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
        credential: this.toResponse(credential),
      };
    }

    if (credential.isUsed) {
      return {
        ok: false,
        reason: 'No se puede revocar una credencial ya utilizada',
        credential: this.toResponse(credential),
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
      credential: this.toResponse(saved),
    };
  }

  async repairLegacyCredentials(limit = 50) {
    const credentials = await this.credentialRepository.find({
      where: { qrCodeValue: IsNull() },
      order: { createdAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 200)),
    });

    const repaired = [] as Array<ReturnType<CredentialService['toResponse']>>;
    for (const credential of credentials) {
      const saved = await this.assignNewQrValue(credential);
      repaired.push(this.toResponse(saved));
    }

    return {
      ok: true,
      repairedCount: repaired.length,
      credentials: repaired,
    };
  }

  async getCredentialById(id: string) {
    const credential = await this.credentialRepository.findOneBy({ id });
    return credential ? this.toResponse(credential) : null;
  }
}
