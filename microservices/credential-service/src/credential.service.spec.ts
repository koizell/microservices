import { BadRequestException } from '@nestjs/common';
import { CredentialService } from './credential.service';

function buildRepo() {
  return {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    update: jest.fn(),
    save: jest.fn().mockImplementation(async (entity: any) => entity),
    create: jest.fn().mockImplementation((entity: any) => entity),
    count: jest.fn(),
    countBy: jest.fn(),
    query: jest.fn(),
    find: jest.fn(),
  };
}

function buildRabbit() {
  return {
    publish: jest.fn(),
    consume: jest.fn(),
    getStatus: jest.fn().mockReturnValue({ connected: true, required: false }),
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('CredentialService.validateQr', () => {
  let service: CredentialService;
  let credentialRepository: any;
  let rabbitMqService: any;
  const originalFetch = global.fetch;
  const originalScannerEnv = process.env.SCANNER_IDS;

  beforeEach(() => {
    credentialRepository = buildRepo();
    rabbitMqService = buildRabbit();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse([])) as any;

    service = new CredentialService(credentialRepository, rabbitMqService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalScannerEnv === undefined) delete process.env.SCANNER_IDS;
    else process.env.SCANNER_IDS = originalScannerEnv;
    jest.clearAllMocks();
  });

  it('returns INVALID when the QR is empty', async () => {
    const result = await service.validateQr('   ', 'gate-1');
    expect(result).toEqual({ valid: false, status: 'INVALID', reason: 'QR no especificado' });
    expect(credentialRepository.findOne).not.toHaveBeenCalled();
  });

  it('returns INVALID when the scanner id is missing', async () => {
    const result = await service.validateQr('hash-1', '   ');
    expect(result).toEqual({ valid: false, status: 'INVALID', reason: 'Scanner no especificado' });
  });

  it('rejects scanners not present in SCANNER_IDS allowlist', async () => {
    process.env.SCANNER_IDS = 'gate-1,gate-2';

    const result = await service.validateQr('hash-1', 'attacker-gate');

    expect(result).toEqual({ valid: false, status: 'INVALID', reason: 'Scanner no autorizado' });
    expect(credentialRepository.findOne).not.toHaveBeenCalled();
  });

  it('returns INVALID when the credential is unknown', async () => {
    credentialRepository.findOne.mockResolvedValueOnce(null);

    const result = await service.validateQr('hash-1', 'gate-1');
    expect(result).toEqual({ valid: false, status: 'INVALID', reason: 'Credential no encontrada' });
  });

  it('returns USED without mutating state when the credential was already consumed', async () => {
    credentialRepository.findOne.mockResolvedValueOnce({
      id: 'c-1',
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      isUsed: true,
      revokedAt: null,
      usedAt: new Date('2026-04-30T10:00:00Z'),
      usedBy: 'gate-prev',
    });

    const result = await service.validateQr('hash-1', 'gate-1');

    expect(result.valid).toBe(false);
    expect(result.status).toBe('USED');
    expect(credentialRepository.update).not.toHaveBeenCalled();
  });

  it('returns REVOKED when the credential was previously revoked', async () => {
    credentialRepository.findOne.mockResolvedValueOnce({
      id: 'c-1',
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      isUsed: false,
      revokedAt: new Date('2026-04-29T10:00:00Z'),
      revokedBy: 'admin-1',
      revokeReason: 'fraude',
    });

    const result = await service.validateQr('hash-1', 'gate-1');

    expect(result.valid).toBe(false);
    expect(result.status).toBe('REVOKED');
    expect(result.reason).toBe('fraude');
  });

  it('atomically marks the credential as used and publishes a checkin event', async () => {
    const credential = {
      id: 'c-1',
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
      isUsed: false,
      revokedAt: null,
    };
    const savedAfterCheckin = {
      ...credential,
      isUsed: true,
      usedAt: new Date('2026-04-30T12:00:00Z'),
      usedBy: 'gate-1',
    };

    credentialRepository.findOne.mockResolvedValueOnce(credential);
    credentialRepository.update.mockResolvedValueOnce({ affected: 1 });
    credentialRepository.findOneBy.mockResolvedValueOnce(savedAfterCheckin);

    const result = await service.validateQr('hash-1', 'gate-1');

    expect(credentialRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c-1', isUsed: false }),
      expect.objectContaining({ isUsed: true, usedBy: 'gate-1' }),
    );
    expect(rabbitMqService.publish).toHaveBeenCalledWith(
      'checkin.processed',
      expect.objectContaining({ credentialId: 'c-1', usedBy: 'gate-1' }),
    );
    expect(result.valid).toBe(true);
    expect(result.status).toBe('USED');
    expect(result.usedBy).toBe('gate-1');
  });

  it('handles a race where another scanner consumed the credential first', async () => {
    const credential = {
      id: 'c-1',
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      isUsed: false,
      revokedAt: null,
    };
    const consumedByOther = {
      ...credential,
      isUsed: true,
      usedAt: new Date(),
      usedBy: 'gate-other',
    };

    credentialRepository.findOne.mockResolvedValueOnce(credential);
    credentialRepository.update.mockResolvedValueOnce({ affected: 0 });
    credentialRepository.findOneBy.mockResolvedValueOnce(consumedByOther);

    const result = await service.validateQr('hash-1', 'gate-1');

    expect(result.valid).toBe(false);
    expect(result.status).toBe('USED');
    expect(rabbitMqService.publish).not.toHaveBeenCalled();
  });
});

describe('CredentialService.ingestPurchaseEvent', () => {
  let service: CredentialService;
  let credentialRepository: any;
  let rabbitMqService: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    credentialRepository = buildRepo();
    rabbitMqService = buildRabbit();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse([])) as any;
    service = new CredentialService(credentialRepository, rabbitMqService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('rejects payloads without orderItemId', async () => {
    await expect(
      service.ingestPurchaseEvent({ ticketTypeId: 'tt', attendeeName: 'Alice' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payloads without ticketTypeId', async () => {
    await expect(
      service.ingestPurchaseEvent({ orderItemId: 'oi-1', attendeeName: 'Alice' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payloads without attendeeName', async () => {
    await expect(
      service.ingestPurchaseEvent({ orderItemId: 'oi-1', ticketTypeId: 'tt-1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a brand new credential and publishes qr.generated for first-time orderItemId', async () => {
    credentialRepository.findOneBy.mockResolvedValueOnce(null);
    credentialRepository.save.mockImplementation(async (entity: any) => ({ ...entity, id: 'cred-new' }));

    const result = await service.ingestPurchaseEvent({
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
    });

    expect(result.created).toBe(true);
    expect(result.ok).toBe(true);
    expect(rabbitMqService.publish).toHaveBeenCalledWith(
      'qr.generated',
      expect.objectContaining({ orderItemId: 'oi-1', attendeeName: 'Alice' }),
    );

    const created = credentialRepository.save.mock.calls[0][0];
    expect(created.qrCodeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.qrCodeValue).toContain('eventhive:ticket:oi-1:');
    expect(created.isUsed).toBe(false);
  });

  it('is idempotent — reuses an existing credential and does NOT publish qr.generated again', async () => {
    credentialRepository.findOneBy.mockResolvedValueOnce({
      id: 'cred-existing',
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
      qrCodeHash: 'h',
      qrCodeValue: 'v',
      isUsed: false,
    });

    const result = await service.ingestPurchaseEvent({
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
    });

    expect(result.created).toBe(false);
    expect(rabbitMqService.publish).not.toHaveBeenCalledWith('qr.generated', expect.anything());
  });

  it('repairs a legacy credential that exists but has no qrCodeValue', async () => {
    credentialRepository.findOneBy.mockResolvedValueOnce({
      id: 'cred-legacy',
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
      qrCodeHash: 'old-hash',
      qrCodeValue: null,
      isUsed: false,
    });

    await service.ingestPurchaseEvent({
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
    });

    const saved = credentialRepository.save.mock.calls[0][0];
    expect(saved.qrCodeValue).toContain('eventhive:ticket:oi-1:');
    expect(saved.qrCodeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.qrCodeHash).not.toBe('old-hash');
  });

  it('trims whitespace from input fields before persisting', async () => {
    credentialRepository.findOneBy.mockResolvedValueOnce(null);

    await service.ingestPurchaseEvent({
      orderItemId: '  oi-1  ',
      ticketTypeId: '  tt-1  ',
      attendeeName: '  Alice  ',
    });

    const created = credentialRepository.save.mock.calls[0][0];
    expect(created.orderItemId).toBe('oi-1');
    expect(created.ticketTypeId).toBe('tt-1');
    expect(created.attendeeName).toBe('Alice');
  });
});

describe('CredentialService.revokeCredential', () => {
  let service: CredentialService;
  let credentialRepository: any;
  let rabbitMqService: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    credentialRepository = buildRepo();
    rabbitMqService = buildRabbit();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse([])) as any;
    service = new CredentialService(credentialRepository, rabbitMqService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns null for unknown credentials', async () => {
    credentialRepository.findOneBy.mockResolvedValueOnce(null);

    await expect(service.revokeCredential('cred-X', 'admin-1', 'duplicada')).resolves.toBeNull();
    expect(rabbitMqService.publish).not.toHaveBeenCalled();
  });

  it('rejects revoking an already-revoked credential', async () => {
    credentialRepository.findOneBy.mockResolvedValueOnce({
      id: 'cred-1',
      revokedAt: new Date(),
      revokedBy: 'admin-1',
      revokeReason: 'previa',
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
      isUsed: false,
    });

    const result = await service.revokeCredential('cred-1', 'admin-2', 'otra');

    expect(result?.ok).toBe(false);
    expect(result?.reason).toContain('ya estaba revocada');
    expect(rabbitMqService.publish).not.toHaveBeenCalled();
  });

  it('rejects revoking a credential that has already been used', async () => {
    credentialRepository.findOneBy.mockResolvedValueOnce({
      id: 'cred-1',
      revokedAt: null,
      isUsed: true,
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
    });

    const result = await service.revokeCredential('cred-1', 'admin-1');

    expect(result?.ok).toBe(false);
    expect(result?.reason).toContain('ya utilizada');
    expect(rabbitMqService.publish).not.toHaveBeenCalled();
  });

  it('persists the revocation, publishes credential.revoked, and applies a default reason', async () => {
    const credential: any = {
      id: 'cred-1',
      revokedAt: null,
      isUsed: false,
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
    };
    credentialRepository.findOneBy.mockResolvedValueOnce(credential);

    const result = await service.revokeCredential('cred-1', '   ', '   ');

    expect(credential.revokedAt).toBeInstanceOf(Date);
    expect(credential.revokedBy).toBe('admin-panel');
    expect(credential.revokeReason).toBe('Revocacion manual');
    expect(rabbitMqService.publish).toHaveBeenCalledWith(
      'credential.revoked',
      expect.objectContaining({ credentialId: 'cred-1', revokedBy: 'admin-panel' }),
    );
    expect(result?.ok).toBe(true);
  });

  it('honors the explicit revokedBy and reason when provided', async () => {
    const credential: any = {
      id: 'cred-1',
      revokedAt: null,
      isUsed: false,
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
    };
    credentialRepository.findOneBy.mockResolvedValueOnce(credential);

    await service.revokeCredential('cred-1', 'admin-7', 'fraude detectado');

    expect(credential.revokedBy).toBe('admin-7');
    expect(credential.revokeReason).toBe('fraude detectado');
  });
});

describe('CredentialService.getStaffScannerContext', () => {
  let service: CredentialService;
  const originalScannerEnv = process.env.SCANNER_IDS;

  beforeEach(() => {
    service = new CredentialService(buildRepo() as any, buildRabbit() as any);
  });

  afterEach(() => {
    if (originalScannerEnv === undefined) delete process.env.SCANNER_IDS;
    else process.env.SCANNER_IDS = originalScannerEnv;
  });

  it('returns the requested scanner id with no restrictions when SCANNER_IDS is not configured', () => {
    delete process.env.SCANNER_IDS;

    const result = service.getStaffScannerContext('gate-mobile-abc');

    expect(result).toEqual({
      scannerId: 'gate-mobile-abc',
      scannersRestricted: false,
      allowedScannerCount: 0,
      source: 'requested',
      overridden: false,
    });
  });

  it('falls back to a default scanner id when none is requested and none configured', () => {
    delete process.env.SCANNER_IDS;
    const result = service.getStaffScannerContext(undefined);

    expect(result.scannerId).toBe('gate-mobile');
    expect(result.scannersRestricted).toBe(false);
    expect(result.source).toBe('generated');
  });

  it('overrides the requested scanner when not in the SCANNER_IDS allowlist', () => {
    process.env.SCANNER_IDS = 'gate-a,gate-b';
    const result = service.getStaffScannerContext('attacker-gate');

    expect(result.scannerId).toBe('gate-a');
    expect(result.scannersRestricted).toBe(true);
    expect(result.overridden).toBe(true);
    expect(result.source).toBe('configured');
  });

  it('keeps the requested scanner when it is in the SCANNER_IDS allowlist', () => {
    process.env.SCANNER_IDS = 'gate-a,gate-b';
    const result = service.getStaffScannerContext('gate-b');

    expect(result.scannerId).toBe('gate-b');
    expect(result.overridden).toBe(false);
    expect(result.source).toBe('requested');
  });
});
