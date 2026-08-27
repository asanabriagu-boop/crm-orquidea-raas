/**
 * mock-gateway.mjs — Pasarela de Pagos Mock (simula Wompi/Epulpay)
 *
 * Genera un link de pago simulado que el usuario puede visitar
 * y "pagar" para probar el flujo completo de compra.
 *
 * En producción se reemplaza con Wompi o Epulpay real.
 */

export class MockGateway {
  /**
   * Crea una intención de pago y devuelve un link simulado.
   * @param {Object} params
   * @param {string} params.dealId - ID del deal asociado
   * @param {number} params.amount - Monto a cobrar
   * @param {string} params.reference - Referencia única
   * @param {string} params.description - Descripción del pago
   * @param {string} params.baseUrl - URL base del servidor (para construir el link)
   * @returns {{ success: boolean, paymentId: string, link: string, reference: string }}
   */
  async createPaymentLink({ dealId, amount, reference, description, baseUrl }) {
    const paymentId = `mock_pay_${Date.now()}`;
    const link = `${baseUrl}/mock-checkout/${paymentId}`;

    return {
      success: true,
      paymentId,
      reference: reference || `REF-${Date.now()}`,
      link,
      amount,
      description,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
    };
  }

  /**
   * Verifica el estado de un pago.
   * @param {string} paymentId
   * @returns {{ status: string, paymentId: string }}
   */
  async checkStatus(paymentId) {
    // En mock siempre chequeamos contra el store real,
    // así que esto es un placeholder.
    return { status: "pending", paymentId };
  }
}

export const mockGateway = new MockGateway();
