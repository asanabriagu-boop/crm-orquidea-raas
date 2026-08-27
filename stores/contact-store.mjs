/**
 * contact-store.mjs — Store de Contactos
 * Soporta multi-tenant: constructor acepta tenantId opcional.
 */
import { BaseStore } from "./base-store.mjs";
import { Contact } from "../models.mjs";
import { checkQuota, incrementUsage } from "../services/plan-enforcer.mjs";

const _defaultInstance = {
  store: null,
  get() {
    if (!this.store) this.store = new ContactStore(null);
    return this.store;
  }
};

export class ContactStore extends BaseStore {
  constructor(tenantId = null) {
    super("contacts", tenantId);
  }

  /** @deprecated Usa StoreFactory.forTenant() en código nuevo */
  static getInstance() {
    return _defaultInstance.get();
  }

  async create(data) {
    // Verificar cuota de contactos del plan
    const quota = await checkQuota(this.tenantId, "contactos");
    if (!quota.allowed) {
      throw new Error(quota.reason);
    }
    const contact = new Contact(data);
    const result = await this.put(contact.toJSON());
    await incrementUsage(this.tenantId, "contactos").catch(() => {});
    return result;
  }

  async findByPhone(phone) {
    const all = await this.getAll();
    return all.find(c => c.phone === phone) || null;
  }

  async findByEmail(email) {
    const all = await this.getAll();
    return all.find(c => c.email === email) || null;
  }

  async findBySource(source) {
    return this.find(c => c.source === source);
  }

  async search(query) {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
}
