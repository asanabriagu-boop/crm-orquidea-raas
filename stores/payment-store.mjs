/**
 * payment-store.mjs — Store de Pagos
 * Registro de transacciones de pago por tenant.
 */
import { BaseStore } from "./base-store.mjs";
import { Payment } from "../models.mjs";

export class PaymentStore extends BaseStore {
  constructor(tenantId = null) {
    super("payments", tenantId);
  }

  async create(data) {
    const payment = new Payment({ ...data, tenantId: this.tenantId });
    return this.put(payment.toJSON());
  }

  async findByDeal(dealId) {
    return this.find(p => p.dealId === dealId);
  }

  async updateStatus(id, status) {
    const payment = await this.get(id);
    if (!payment) return null;
    payment.status = status;
    payment.updatedAt = new Date().toISOString();
    return this.put(payment);
  }
}
