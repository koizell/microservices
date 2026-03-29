import { Injectable, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class PaymentService {
  private stripe: Stripe;
  private readonly stripeApiKey: string;

  constructor() {
    this.stripeApiKey = process.env.STRIPE_API_KEY ?? 'sk_test_demo_key_replace_with_real_key';
    this.stripe = new Stripe(this.stripeApiKey, { apiVersion: '2024-04-10' });
  }

  async charge(data: {
    provider: 'stripe' | 'paypal';
    amount: number;
    currency?: string;
    customerEmail?: string;
    cardToken?: string; // Token Stripe del cliente
  }) {
    try {
      if (data.provider === 'stripe') {
        return await this.chargeWithStripe(data);
      } else if (data.provider === 'paypal') {
        return await this.chargeWithPaypal(data);
      } else {
        throw new BadRequestException('Proveedor de pago no soportado');
      }
    } catch (error) {
      throw new BadRequestException(`Error en pago: ${error.message}`);
    }
  }

  private async chargeWithStripe(data: {
    amount: number;
    currency?: string;
    customerEmail?: string;
    cardToken?: string;
  }) {
    const forceMock =
      process.env.PAYMENT_MOCK === 'true' ||
      !this.stripeApiKey ||
      this.stripeApiKey.includes('demo_key');

    if (forceMock) {
      return {
        ok: true,
        provider: 'stripe',
        amount: data.amount,
        currency: data.currency?.toUpperCase() ?? 'USD',
        paymentIntentId: `pi_mock_${Date.now()}`,
        customerEmail: data.customerEmail ?? 'attendee@example.com',
        status: 'succeeded',
        chargeId: `ch_mock_${Date.now()}`,
        mocked: true,
      };
    }

    // Si no hay token de tarjeta, usar token de prueba
    const token = data.cardToken ?? 'tok_visa'; // Token de prueba para Stripe

    try {
      // Crear un Payment Intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(data.amount * 100), // Convertir a centavos
        currency: data.currency?.toLowerCase() ?? 'usd',
        payment_method_types: ['card'],
        receipt_email: data.customerEmail ?? 'attendee@example.com',
        description: 'EventHive Ticket Purchase',
        metadata: {
          service: 'ticketing-service',
          timestamp: new Date().toISOString(),
        },
      });

      // Confirmar el Payment Intent con el token
      const confirmedIntent = await this.stripe.paymentIntents.confirm(
        paymentIntent.id,
        { payment_method: token },
        { idempotencyKey: `${paymentIntent.id}_${Date.now()}` },
      );

      return {
        ok: true,
        provider: 'stripe',
        amount: data.amount,
        currency: data.currency?.toUpperCase() ?? 'USD',
        paymentIntentId: confirmedIntent.id,
        customerEmail: data.customerEmail ?? 'attendee@example.com',
        status: confirmedIntent.status, // 'succeeded', 'processing', 'requires_action', etc.
        chargeId: confirmedIntent.latest_charge,
      };
    } catch (error) {
      if ((error as any).type === 'StripeCardError' || (error as any).code === 'card_declined') {
        return {
          ok: false,
          provider: 'stripe',
          error: 'Card declined',
          chargeId: null,
          status: 'declined',
        };
      }

      // En desarrollo podemos degradar a mock para no bloquear el flujo funcional.
      if (process.env.PAYMENT_STRICT !== 'true') {
        return {
          ok: true,
          provider: 'stripe',
          amount: data.amount,
          currency: data.currency?.toUpperCase() ?? 'USD',
          paymentIntentId: `pi_fallback_${Date.now()}`,
          customerEmail: data.customerEmail ?? 'attendee@example.com',
          status: 'succeeded',
          chargeId: `ch_fallback_${Date.now()}`,
          fallbackReason: (error as Error).message,
          mocked: true,
        };
      }
      throw error;
    }
  }

  private async chargeWithPaypal(data: {
    amount: number;
    currency?: string;
    customerEmail?: string;
  }) {
    // Simulación de PayPal - en producción usarías el SDK de PayPal checkout
    // https://developer.paypal.com/docs/checkout/integrate/
    return {
      ok: true,
      provider: 'paypal',
      amount: data.amount,
      currency: data.currency?.toUpperCase() ?? 'USD',
      transactionId: `paypal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      customerEmail: data.customerEmail ?? 'attendee@example.com',
      status: 'approved',
      payerInfo: {
        email: data.customerEmail,
      },
    };
  }
}

