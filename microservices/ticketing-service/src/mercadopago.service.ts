import { Injectable, Logger } from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
// v1

export interface MpItem {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  currency_id?: string;
}

export interface CreatePreferenceResult {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly client: MercadoPagoConfig | null;

  constructor() {
    const token = String(process.env.MP_ACCESS_TOKEN ?? '').trim();
    if (!token || token === 'TEST-REEMPLAZAR_CON_TU_TOKEN') {
      this.logger.warn('[MercadoPago] MP_ACCESS_TOKEN no configurado — pagos MP deshabilitados');
      this.client = null;
    } else {
      this.client = new MercadoPagoConfig({ accessToken: token });
      this.logger.log('[MercadoPago] SDK inicializado correctamente');
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  isSandbox(): boolean {
    const token = String(process.env.MP_ACCESS_TOKEN ?? '').trim();
    return token.startsWith('TEST-');
  }

  async createPreference(
    items: MpItem[],
    externalReference: string,
    payerEmail?: string,
  ): Promise<CreatePreferenceResult> {
    if (!this.client) {
      throw new Error('MP_ACCESS_TOKEN no está configurado en las variables de entorno del ticketing-service.');
    }

    const preference = new Preference(this.client);

    const successUrl = String(process.env.MP_BACK_URL_SUCCESS ?? 'http://localhost:3002/tickets/mp/success');
    const failureUrl = String(process.env.MP_BACK_URL_FAILURE ?? 'http://localhost:3002/tickets/mp/failure');
    const pendingUrl = String(process.env.MP_BACK_URL_PENDING ?? 'http://localhost:3002/tickets/mp/pending');
    const webhookUrl = String(process.env.MP_WEBHOOK_URL ?? '').trim();

    // auto_return solo válido cuando back_urls son URLs públicas (no localhost)
    const isPublicUrl = (url: string) =>
      url.startsWith('https://') || (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1'));

    const body: any = {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        currency_id: item.currency_id ?? 'COP',
      })),
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      external_reference: externalReference,
    };

    // En sandbox quitamos auto_return y excluded_payment_types — son los dos
    // campos que con mayor frecuencia hacen que la UI sandbox de MP cuelgue el
    // boton Continuar. En produccion (token APP_USR-) se mantienen los originales
    // porque ahi auto_return ahorra un click al usuario y excluir wallets evita
    // que el comprador pague con saldo MP del vendedor.
    const isProd = !String(process.env.MP_ACCESS_TOKEN ?? '').trim().startsWith('TEST-');

    if (isProd && isPublicUrl(successUrl)) {
      body.auto_return = 'approved';
    }

    if (isProd) {
      body.payment_methods = {
        excluded_payment_types: [
          { id: 'digital_currency' },
          { id: 'digital_wallet' },
          { id: 'bank_transfer' },
        ],
      };
    }

    if (webhookUrl) body.notification_url = webhookUrl;
    // No enviar payer.email para evitar que MP asocie el pago con la cuenta del vendedor en sandbox

    const result = await preference.create({ body });

    return {
      id: result.id ?? '',
      init_point: result.init_point ?? '',
      sandbox_init_point: result.sandbox_init_point ?? '',
    };
  }

  async getPayment(paymentId: string): Promise<any> {
    if (!this.client) return null;
    const payment = new Payment(this.client);
    return await payment.get({ id: paymentId });
  }

  /** Busca en MP un pago aprobado con el external_reference dado */
  async searchApprovedPaymentByRef(extRef: string): Promise<{ paymentId: string } | null> {
    if (!this.client) return null;
    const token = String(process.env.MP_ACCESS_TOKEN ?? '').trim();
    try {
      const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(extRef)}&status=approved`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data: any = await res.json();
      const payment = data?.results?.[0];
      if (payment?.id) {
        return { paymentId: String(payment.id) };
      }
    } catch (e) {
      this.logger.warn('[MP] Error buscando pago por referencia: ' + (e as any)?.message);
    }
    return null;
  }
}
