import { ForbiddenException } from '@nestjs/common';
import { CredentialController } from './credential.controller';

describe('CredentialController', () => {
  const credentialService = {
    getStaffScannerContext: jest.fn(),
    getOperationalStatus: jest.fn(),
    getCredentialsForAuthorization: jest.fn(),
    createFromPurchase: jest.fn(),
    ingestPurchaseEvent: jest.fn(),
    validateQr: jest.fn(),
    revokeCredential: jest.fn(),
    countAll: jest.fn(),
    repairLegacyCredentials: jest.fn(),
    findAll: jest.fn(),
    getCredentialById: jest.fn(),
  };

  const controller = new CredentialController(credentialService as any);

  afterEach(() => jest.clearAllMocks());

  it('falls back to an empty authorization string when none is provided', async () => {
    credentialService.getCredentialsForAuthorization.mockResolvedValueOnce([]);

    await controller.myCredentials(undefined);

    expect(credentialService.getCredentialsForAuthorization).toHaveBeenCalledWith('');
  });

  it('rejects ticket-purchased events that do not come from ticketing-service', async () => {
    await expect(
      controller.ingestPurchaseEvent('attacker', { orderItemId: 'oi-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(credentialService.ingestPurchaseEvent).not.toHaveBeenCalled();
  });

  it('accepts ticket-purchased events forwarded by ticketing-service (case-insensitive)', async () => {
    credentialService.ingestPurchaseEvent.mockResolvedValueOnce({ ok: true });

    await controller.ingestPurchaseEvent('Ticketing-Service', {
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
    });

    expect(credentialService.ingestPurchaseEvent).toHaveBeenCalledWith({
      orderItemId: 'oi-1',
      ticketTypeId: 'tt-1',
      attendeeName: 'Alice',
    });
  });

  it('rejects events with whitespace-only x-forwarded-by header', async () => {
    await expect(controller.ingestPurchaseEvent('   ', { orderItemId: 'oi-1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.ingestPurchaseEvent(undefined, { orderItemId: 'oi-1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('uses the "admin-panel" default revoker when revokedBy is omitted', async () => {
    credentialService.revokeCredential.mockResolvedValueOnce({ ok: true });

    await controller.revoke('cred-1', { reason: 'duplicada' });

    expect(credentialService.revokeCredential).toHaveBeenCalledWith('cred-1', 'admin-panel', 'duplicada');
  });

  it('honors the explicit revokedBy when provided', async () => {
    credentialService.revokeCredential.mockResolvedValueOnce({ ok: true });

    await controller.revoke('cred-1', { revokedBy: 'admin-1', reason: 'fraude' });

    expect(credentialService.revokeCredential).toHaveBeenCalledWith('cred-1', 'admin-1', 'fraude');
  });

  it('parses the limit query into a number when running legacy repair', async () => {
    credentialService.repairLegacyCredentials.mockResolvedValueOnce({ ok: true, repairedCount: 0 });

    await controller.repairLegacy('25');

    expect(credentialService.repairLegacyCredentials).toHaveBeenCalledWith(25);
  });

  it('falls back to a default limit of 50 on findAll when not specified', async () => {
    credentialService.findAll.mockResolvedValueOnce([]);

    await controller.findAll(undefined);

    expect(credentialService.findAll).toHaveBeenCalledWith(50);
  });

  it('falls back to a default limit of 50 on repair when not specified', async () => {
    credentialService.repairLegacyCredentials.mockResolvedValueOnce({ ok: true, repairedCount: 0 });

    await controller.repairLegacy(undefined);

    expect(credentialService.repairLegacyCredentials).toHaveBeenCalledWith(50);
  });
});
