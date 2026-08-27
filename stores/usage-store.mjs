/**
 * usage-store.mjs — Contadores de uso por tenant (SQLite)
 *
 * Lleva la cuenta de razonamientos, contactos y deals usados en el mes.
 * Reseteo automático mensual.
 */

import { BaseStore } from "./base-store.mjs";

const USAGE_ID = "usage";

const _instances = new Map();

export class UsageStore {
  constructor(tenantId = null) {
    this.tenantId = tenantId;
    this._store = new BaseStore("usage", tenantId);
  }

  static getInstance(tenantId = null) {
    const key = tenantId || "__default__";
    if (!_instances.has(key)) {
      _instances.set(key, new UsageStore(tenantId));
    }
    return _instances.get(key);
  }

  async _getOrCreateUsage() {
    let usage = await this._store.get(USAGE_ID);
    if (!usage) {
      usage = {
        id: USAGE_ID,
        tenantId: this.tenantId,
        razonamientos_usados: 0,
        contactos_creados: 0,
        deals_creados: 0,
        ultimo_reseteo: new Date().toISOString(),
      };
      await this._store.put(usage);
    }
    return usage;
  }

  async _checkReset() {
    const usage = await this._getOrCreateUsage();
    const lastReset = new Date(usage.ultimo_reseteo);
    const now = new Date();
    const daysSinceReset = (now - lastReset) / (1000 * 60 * 60 * 24);
    if (daysSinceReset >= 30) {
      usage.razonamientos_usados = 0;
      usage.contactos_creados = 0;
      usage.deals_creados = 0;
      usage.ultimo_reseteo = now.toISOString();
      await this._store.put(usage);
    }
    return usage;
  }

  async getUsage() {
    const usage = await this._checkReset();
    return { ...usage };
  }

  async increment(resource, count = 1) {
    const usage = await this._checkReset();
    if (resource === "razonamientos") usage.razonamientos_usados += count;
    else if (resource === "contactos") usage.contactos_creados += count;
    else if (resource === "deals") usage.deals_creados += count;
    else throw new Error(`Recurso desconocido: ${resource}`);
    await this._store.put(usage);
    return usage;
  }

  async resetResource(resource) {
    const usage = await this._getOrCreateUsage();
    if (resource === "razonamientos") usage.razonamientos_usados = 0;
    else if (resource === "contactos") usage.contactos_creados = 0;
    else if (resource === "deals") usage.deals_creados = 0;
    else if (resource === "all") {
      usage.razonamientos_usados = 0;
      usage.contactos_creados = 0;
      usage.deals_creados = 0;
    }
    await this._store.put(usage);
    return usage;
  }
}
