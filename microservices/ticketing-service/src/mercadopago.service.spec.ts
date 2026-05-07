import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { MercadoPagoService } from './mercadopago.service';

jest.mock('mercadopago', () => {
  const createMock = jest.fn();
  const getMock = jest.fn();
  return {
    MercadoPagoConfig: jest.fn().mockImplementation((opts: any) => ({ accessToken: opts.accessToken })),
    Preference: jest.fn().mockImplementation(() => ({ create: createMock })),
    Payment: jest.fn().mockImplementation(() => ({ get: getMock })),
    __createMock: createMock,
    __getMock: getMock,
  };
});

const mp = require('mercadopago');

describe('MercadoPagoService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MP_ACCESS_TOKEN;
    delete process.env.MP_BACK_URL_SUCCESS;
    delete process.env.MP_BACK_URL_FAILURE;
    delete process.env.MP_BACK_URL_PENDING;
    delete process.env.MP_WEBHOOK_URL;
    mp.__createMock.mockReset();
    mp.__getMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('is disabled when MP_ACCESS_TOKEN is missing', () => {
      const service = new MercadoPagoService();
      expect(service.isEnabled()).toBe(false);
    });

    it('is disabled when token is the default placeholder', () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-REEMPLAZAR_CON_TU_TOKEN';
      const service = new MercadoPagoService();
      expect(service.isEnabled()).toBe(false);
    });

    it('is enabled when a real token is configured', () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-1234567890-realtoken';
      const service = new MercadoPagoService();
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('createPreference', () => {
    it('throws when MP is not enabled (token missing)', async () => {
      const service = new MercadoPagoService();

      await expect(
        service.createPreference([{ id: '1', title: 'Ticket', quantity: 1, unit_price: 100 }], 'order-1'),
      ).rejects.toThrow(/MP_ACCESS_TOKEN/);
    });

    it('does NOT add auto_return when back_urls are localhost (MP would reject it)', async () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-realtoken';
      process.env.MP_BACK_URL_SUCCESS = 'http://localhost:3002/tickets/mp/success';
      process.env.MP_BACK_URL_FAILURE = 'http://localhost:3002/tickets/mp/failure';
      process.env.MP_BACK_URL_PENDING = 'http://localhost:3002/tickets/mp/pending';

      mp.__createMock.mockResolvedValue({ id: 'pref-1', init_point: 'http://x', sandbox_init_point: 'http://y' });

      const service = new MercadoPagoService();
      await service.createPreference(
        [{ id: '1', title: 'Ticket', quantity: 2, unit_price: 50, currency_id: 'COP' }],
        'order-42',
      );

      const call = mp.__createMock.mock.calls[0][0];
      expect(call.body.auto_return).toBeUndefined();
    });

    it('adds auto_return=approved when back_urls point to a public https URL', async () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-realtoken';
      process.env.MP_BACK_URL_SUCCESS = 'https://eventhive.app/mp/success';
      process.env.MP_BACK_URL_FAILURE = 'https://eventhive.app/mp/failure';
      process.env.MP_BACK_URL_PENDING = 'https://eventhive.app/mp/pending';

      mp.__createMock.mockResolvedValue({ id: 'pref-1', init_point: 'http://x', sandbox_init_point: 'http://y' });

      const service = new MercadoPagoService();
      await service.createPreference([{ id: '1', title: 'Ticket', quantity: 1, unit_price: 100 }], 'order-1');

      const call = mp.__createMock.mock.calls[0][0];
      expect(call.body.auto_return).toBe('approved');
    });

    it('does NOT add auto_return when only one of the back_urls is public', async () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-realtoken';
      process.env.MP_BACK_URL_SUCCESS = 'http://localhost:3002/x';

      mp.__createMock.mockResolvedValue({ id: 'pref-1', init_point: '', sandbox_init_point: '' });

      const service = new MercadoPagoService();
      await service.createPreference([{ id: '1', title: 'T', quantity: 1, unit_price: 1 }], 'order-1');

      const call = mp.__createMock.mock.calls[0][0];
      expect(call.body.auto_return).toBeUndefined();
    });

    it('always excludes wallet/digital_currency/bank_transfer payment methods', async () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-realtoken';
      mp.__createMock.mockResolvedValue({ id: 'pref-1', init_point: '', sandbox_init_point: '' });

      const service = new MercadoPagoService();
      await service.createPreference([{ id: '1', title: 'T', quantity: 1, unit_price: 1 }], 'order-1');

      const call = mp.__createMock.mock.calls[0][0];
      const excluded = call.body.payment_methods.excluded_payment_types.map((p: any) => p.id);
      expect(excluded).toEqual(expect.arrayContaining(['digital_currency', 'digital_wallet', 'bank_transfer']));
    });

    it('forwards currency_id="COP" by default and overrides when provided', async () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-realtoken';
      mp.__createMock.mockResolvedValue({ id: 'pref-1', init_point: '', sandbox_init_point: '' });

      const service = new MercadoPagoService();
      await service.createPreference(
        [
          { id: '1', title: 'A', quantity: 1, unit_price: 1 },
          { id: '2', title: 'B', quantity: 1, unit_price: 2, currency_id: 'USD' },
        ],
        'order-1',
      );

      const items = mp.__createMock.mock.calls[0][0].body.items;
      expect(items[0].currency_id).toBe('COP');
      expect(items[1].currency_id).toBe('USD');
    });

    it('attaches notification_url only when MP_WEBHOOK_URL is configured', async () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-realtoken';
      mp.__createMock.mockResolvedValue({ id: 'pref-1', init_point: '', sandbox_init_point: '' });

      const service = new MercadoPagoService();
      await service.createPreference([{ id: '1', title: 'T', quantity: 1, unit_price: 1 }], 'order-1');
      expect(mp.__createMock.mock.calls[0][0].body.notification_url).toBeUndefined();

      process.env.MP_WEBHOOK_URL = 'https://hook.example.com/mp';
      mp.__createMock.mockResolvedValue({ id: 'pref-2', init_point: '', sandbox_init_point: '' });
      const service2 = new MercadoPagoService();
      await service2.createPreference([{ id: '1', title: 'T', quantity: 1, unit_price: 1 }], 'order-1');
      expect(mp.__createMock.mock.calls[1][0].body.notification_url).toBe('https://hook.example.com/mp');
    });

    it('returns the SDK ids defaulted to empty strings when MP omits them', async () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-realtoken';
      mp.__createMock.mockResolvedValue({});

      const service = new MercadoPagoService();
      const result = await service.createPreference(
        [{ id: '1', title: 'T', quantity: 1, unit_price: 1 }],
        'order-1',
      );

      expect(result).toEqual({ id: '', init_point: '', sandbox_init_point: '' });
    });
  });

  describe('getPayment', () => {
    it('returns null when MP is not enabled', async () => {
      const service = new MercadoPagoService();

      await expect(service.getPayment('payment-1')).resolves.toBeNull();
    });

    it('delegates to the MP SDK when enabled', async () => {
      process.env.MP_ACCESS_TOKEN = 'TEST-realtoken';
      mp.__getMock.mockResolvedValue({ id: 'p-1', status: 'approved' });

      const service = new MercadoPagoService();
      const result = await service.getPayment('p-1');

      expect(mp.__getMock).toHaveBeenCalledWith({ id: 'p-1' });
      expect(result).toEqual({ id: 'p-1', status: 'approved' });
    });
  });
});
