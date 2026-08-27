/**
 * deal-store.mjs — Store de Deals (oportunidades de venta)
 * Soporta multi-tenant: constructor acepta tenantId opcional.
 */
import { BaseStore } from "./base-store.mjs";
import { Deal } from "../models.mjs";
import { checkQuota, incrementUsage } from "../services/plan-enforcer.mjs";

const _defaultInstance = {
  store: null,
  get() {
    if (!this.store) this.store = new DealStore(null);
    return this.store;
  }
};

export class DealStore extends BaseStore {
  constructor(tenantId = null) {
    super("deals", tenantId);
  }

  /** @deprecated Usa StoreFactory.forTenant() en código nuevo */
  static getInstance() {
    return _defaultInstance.get();
  }

  async create(data) {
    // Verificar cuota de deals del plan
    const quota = await checkQuota(this.tenantId, "deals");
    if (!quota.allowed) {
      throw new Error(quota.reason);
    }
    const deal = new Deal(data);
    const result = await this.put(deal.toJSON());
    await incrementUsage(this.tenantId, "deals").catch(() => {});
    return result;
  }

  async findByContact(contactId) {
    const all = await this.getAll();
    return all.filter(d => d.contactId === contactId);
  }

  async findByStage(stage) {
    const all = await this.getAll();
    return all.filter(d => d.stage === stage);
  }

  async updateStage(id, newStage) {
    const deal = await this.get(id);
    if (!deal) return null;
    deal.stage = newStage;
    deal.updatedAt = new Date().toISOString();
    return this.put(deal);
  }

  async getPipelineSummary() {
    const all = await this.getAll();
    const stages = {};
    let totalValue = 0;
    for (const d of all) {
      stages[d.stage] = (stages[d.stage] || 0) + 1;
      totalValue += d.value || 0;
    }
    return { stages, totalDeals: all.length, totalValue };
  }
}
