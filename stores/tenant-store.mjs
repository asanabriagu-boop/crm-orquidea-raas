/**
 * tenant-store.mjs — Store de Tenants (registry multitenant)
 *
 * Gestiona el registro de tenants. NO pertenece a un tenant específico,
 * es el directorio central de "quiénes son nuestros clientes".
 *
 * Persiste en: data/tenants.json
 */
import { BaseStore } from "./base-store.mjs";
import { Tenant } from "../models.mjs";

let _instance = null;

export class TenantStore {
  constructor() {
    this._store = new BaseStore("tenants");
  }

  static getInstance() {
    if (!_instance) _instance = new TenantStore();
    return _instance;
  }

  async create(data) {
    const tenant = new Tenant(data);
    return this._store.put(tenant.toJSON());
  }

  async get(id) {
    return this._store.get(id);
  }

  async findBySlug(slug) {
    const all = await this._store.getAll();
    return all.find(t => t.slug === slug) || null;
  }

  async listActive() {
    const all = await this._store.getAll();
    return all.filter(t => t.isActive);
  }

  async getAll() {
    return this._store.getAll();
  }

  async delete(id) {
    return this._store.delete(id);
  }

  async deleteBySlug(slug) {
    const all = await this._store.getAll();
    const matches = all.filter(t => t.slug === slug);
    for (const t of matches) {
      await this._store.delete(t.id);
    }
    return matches.length;
  }
}
