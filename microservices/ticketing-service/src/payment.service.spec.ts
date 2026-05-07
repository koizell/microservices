import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.PAYMENT_MOCK;
    delete process.env.PAYMENT_STRICT;
    delete process.env.STRIPE_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  describe('charge — paypal branch', () => {
    it('returns an approved paypal payment with a generated transactionId', async () => {
      const service = new PaymentService();

      const result: any = await service.charge({
        provider: 'paypal',
        amount: 50,
        currency: 'usd',
        customerEmail: 'buyer@mail.com',
      });

      expect(result.ok).toBe(true);
      expect(result.provider).toBe('paypal');
      expect(result.status).toBe('approved');
      expect(result.currency).toBe('USD');
      expect(result.transactionId).toMatch(/^paypal_\d+_/);
      expect(result.payerInfo).toEqual({ email: 'buyer@mail.com' });
    });

    it('falls back to default email and USD currency when omitted', async () => {
      const service = new PaymentService();

      const result: any = await service.charge({ provider: 'paypal', amount: 10 });

      expect(result.currency).toBe('USD');
      expect(result.customerEmail).toBe('attendee@example.com');
    });
  });

  describe('charge — unsupported provider', () => {
    it('throws BadRequestException for an unknown provider', async () => {
      const service = new PaymentService();

      await expect(
        service.charge({ provider: 'crypto' as any, amount: 100 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('charge — stripe branch with mock key (default)', () => {
    it('uses mock when no STRIPE_API_KEY is configured (demo key fallback)', async () => {
      const service = new PaymentService();

      const result: any = await service.charge({
        provider: 'stripe',
        amount: 75.5,
        currency: 'eur',
        customerEmail: 'eu@mail.com',
      });

      expect(result.ok).toBe(true);
      expect(result.provider).toBe('stripe');
      expect(result.mocked).toBe(true);
      expect(result.amount).toBe(75.5);
      expect(result.currency).toBe('EUR');
      expect(result.status).toBe('succeeded');
      expect(result.paymentIntentId).toMatch(/^pi_mock_/);
      expect(result.chargeId).toMatch(/^ch_mock_/);
    });

    it('uses mock when PAYMENT_MOCK=true even with a real-looking key', async () => {
      process.env.STRIPE_API_KEY = 'sk_live_real_key_lookalike';
      process.env.PAYMENT_MOCK = 'true';

      const service = new PaymentService();
      const result: any = await service.charge({ provider: 'stripe', amount: 10 });

      expect(result.mocked).toBe(true);
      expect(result.paymentIntentId).toMatch(/^pi_mock_/);
    });

    it('defaults the email and currency when missing in mock mode', async () => {
      const service = new PaymentService();

      const result: any = await service.charge({ provider: 'stripe', amount: 5 });

      expect(result.currency).toBe('USD');
      expect(result.customerEmail).toBe('attendee@example.com');
    });
  });

  describe('charge — stripe branch with real key', () => {
    it('confirms the payment intent with the provided card token and returns the confirmed status', async () => {
      process.env.STRIPE_API_KEY = 'sk_live_realistic_key_value_xxx';

      const service = new PaymentService();
      const created = { id: 'pi_test_1' };
      const confirmed = { id: 'pi_test_1', status: 'succeeded', latest_charge: 'ch_test_1' };

      const createSpy = jest.spyOn((service as any).stripe.paymentIntents, 'create').mockResolvedValue(created as any);
      const confirmSpy = jest.spyOn((service as any).stripe.paymentIntents, 'confirm').mockResolvedValue(confirmed as any);

      const result: any = await service.charge({
        provider: 'stripe',
        amount: 12.34,
        currency: 'usd',
        customerEmail: 'buyer@mail.com',
        cardToken: 'tok_custom',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1234,
          currency: 'usd',
          payment_method_types: ['card'],
          receipt_email: 'buyer@mail.com',
        }),
      );
      expect(confirmSpy).toHaveBeenCalledWith(
        'pi_test_1',
        { payment_method: 'tok_custom' },
        expect.objectContaining({ idempotencyKey: expect.stringContaining('pi_test_1_') }),
      );
      expect(result.ok).toBe(true);
      expect(result.status).toBe('succeeded');
      expect(result.paymentIntentId).toBe('pi_test_1');
    });

    it('uses the test card token "tok_visa" when none is provided', async () => {
      process.env.STRIPE_API_KEY = 'sk_live_realistic_key_value_xxx';

      const service = new PaymentService();
      jest.spyOn((service as any).stripe.paymentIntents, 'create').mockResolvedValue({ id: 'pi_2' } as any);
      const confirmSpy = jest.spyOn((service as any).stripe.paymentIntents, 'confirm').mockResolvedValue({
        id: 'pi_2',
        status: 'succeeded',
        latest_charge: 'ch_2',
      } as any);

      await service.charge({ provider: 'stripe', amount: 1 });

      expect(confirmSpy.mock.calls[0][1]).toEqual({ payment_method: 'tok_visa' });
    });

    it('returns ok=false declined when Stripe throws StripeCardError', async () => {
      process.env.STRIPE_API_KEY = 'sk_live_realistic_key_value_xxx';

      const service = new PaymentService();
      const cardError: any = new Error('card declined');
      cardError.type = 'StripeCardError';
      jest.spyOn((service as any).stripe.paymentIntents, 'create').mockRejectedValue(cardError);

      const result: any = await service.charge({ provider: 'stripe', amount: 10 });

      expect(result.ok).toBe(false);
      expect(result.provider).toBe('stripe');
      expect(result.status).toBe('declined');
      expect(result.chargeId).toBeNull();
    });

    it('falls back to a synthetic success on generic errors when not in strict mode', async () => {
      process.env.STRIPE_API_KEY = 'sk_live_realistic_key_value_xxx';
      delete process.env.PAYMENT_STRICT;

      const service = new PaymentService();
      jest.spyOn((service as any).stripe.paymentIntents, 'create').mockRejectedValue(new Error('connection lost'));

      const result: any = await service.charge({ provider: 'stripe', amount: 8 });

      expect(result.ok).toBe(true);
      expect(result.mocked).toBe(true);
      expect(result.fallbackReason).toBe('connection lost');
      expect(result.paymentIntentId).toMatch(/^pi_fallback_/);
    });

    it('rethrows generic errors as BadRequestException when PAYMENT_STRICT=true', async () => {
      process.env.STRIPE_API_KEY = 'sk_live_realistic_key_value_xxx';
      process.env.PAYMENT_STRICT = 'true';

      const service = new PaymentService();
      jest.spyOn((service as any).stripe.paymentIntents, 'create').mockRejectedValue(new Error('upstream 5xx'));

      await expect(service.charge({ provider: 'stripe', amount: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
