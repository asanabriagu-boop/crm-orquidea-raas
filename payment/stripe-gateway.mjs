/**
 * stripe-gateway.mjs — Pasarela de Pagos Stripe
 *
 * Integración real con Stripe Checkout Sessions.
 * Crea una sesión de pago y redirige al checkout de Stripe.
 *
 * El webhook actualiza el plan del tenant cuando se completa el pago.
 */

import Stripe from "stripe";

export class StripeGateway {
  constructor() {
    this._stripe = null;
  }

  _getClient() {
    if (!this._stripe) {
      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (!secretKey) return null;
      this._stripe = new Stripe(secretKey);
    }
    return this._stripe;
  }

  /**
   * Crea una sesión de checkout en Stripe.
   * @param {Object} params
   * @param {string} params.planId - "starter" | "professional" | "enterprise"
   * @param {string} params.tenantSlug - Slug del tenant que compra
   * @param {string} params.baseUrl - URL base del servidor
   * @param {string} params.tenantName - Nombre del tenant (para metadata)
   * @returns {{ success: boolean, url: string, sessionId: string } | { success: false, error: string }}
   */
  async createCheckoutSession({ planId, tenantSlug, baseUrl, tenantName }) {
    const stripe = this._getClient();
    if (!stripe) {
      // Fallback a mock si Stripe no está configurado
      return this._createMockSession({ planId, tenantSlug, baseUrl });
    }

    // Mapear planId a Price ID de Stripe
    const priceMap = {
      starter: process.env.STRIPE_PRICE_STARTER,
      professional: process.env.STRIPE_PRICE_PRO,
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
    };
    const priceId = priceMap[planId];
    if (!priceId) {
      return { success: false, error: `Plan '${planId}' no tiene un Price ID configurado` };
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: planId === "enterprise" ? "payment" : "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          tenantSlug,
          planId,
          tenantName: tenantName || tenantSlug,
        },
        success_url: `${baseUrl}/api/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing?canceled=true`,
      });

      return {
        success: true,
        url: session.url,
        sessionId: session.id,
      };
    } catch (err) {
      console.error("❌ Stripe checkout error:", err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Mock para desarrollo local sin Stripe.
   */
  async _createMockSession({ planId, tenantSlug, baseUrl }) {
    const mockId = `cs_mock_${Date.now()}`;
    const mockUrl = `${baseUrl}/api/checkout/success?session_id=${mockId}&mock=true&plan=${planId}&tenant=${tenantSlug}`;
    console.log(`  🏪 Mock Stripe: ${mockUrl}`);
    return {
      success: true,
      url: mockUrl,
      sessionId: mockId,
      _mock: true,
    };
  }

  /**
   * Procesa un webhook de Stripe.
   * @param {string} body - Raw request body (Buffer)
   * @param {string} signature - Stripe-Signature header
   * @returns {{ success: boolean, type: string, data: Object } | { success: false, error: string }}
   */
  async handleWebhook(body, signature) {
    const stripe = this._getClient();
    if (!stripe) {
      return { success: false, error: "Stripe no configurado" };
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return { success: false, error: "STRIPE_WEBHOOK_SECRET no configurado" };
    }

    try {
      const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      return {
        success: true,
        type: event.type,
        data: event.data.object,
      };
    } catch (err) {
      return { success: false, error: `Firma inválida: ${err.message}` };
    }
  }

  /**
   * Obtiene el estado de una sesión de checkout.
   */
  async getSession(sessionId) {
    const stripe = this._getClient();
    if (!stripe) return null;
    try {
      return await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return null;
    }
  }
}

export const stripeGateway = new StripeGateway();
