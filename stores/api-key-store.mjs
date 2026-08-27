/**
 * api-key-store.mjs — Store de API Keys multi-tenant
 *
 * Cada tenant puede generar múltiples API keys para integración HTTP.
 * Las claves completas solo se muestran UNA vez al crearlas (seguridad).
 * Persiste en SQLite via BaseStore.
 */
import { BaseStore } from "./base-store.mjs";
import { ApiKey } from "../models.mjs";
import crypto from "crypto";

const KEY_PREFIX = "crm_sk";
const KEY_BYTES = 32; // 256-bit key → 64 hex chars

let _defaultInstance = null;

export class ApiKeyStore {
  constructor(tenantId = null) {
    this._store = new BaseStore("api_keys", tenantId);
    this.tenantId = tenantId;
  }

  static getInstance() {
    if (!_defaultInstance) _defaultInstance = new ApiKeyStore();
    return _defaultInstance;
  }

  /**
   * Genera una nueva API key.
   * @returns {{ key: string, record: Object }} key = full key (show once), record = saved record
   */
  async create({ label, expiresAt = null }) {
    const rawKey = crypto.randomBytes(KEY_BYTES).toString("hex");
    const fullKey = `${KEY_PREFIX}_${rawKey}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    const lastDigits = fullKey.slice(-4);

    const record = new ApiKey({
      tenantSlug: this.tenantId,
      label: label || "API Key",
      keyPrefix: fullKey.slice(0, 11), // "crm_sk_xxxxxx"
      keyHash,
      lastDigits,
      expiresAt,
    });

    await this._store.put(record.toJSON());
    return { key: fullKey, record };
  }

  /**
   * Valida una API key completa contra los hash almacenados.
   * @returns {Object|null} record if valid, null if not
   */
  async validate(fullKey) {
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    const all = await this._store.getAll();
    for (const record of all) {
      if (record.keyHash === keyHash) {
        if (!record.isActive) return null;
        if (record.expiresAt && new Date(record.expiresAt) < new Date()) return null;
        // Actualizar lastUsedAt
        record.lastUsedAt = new Date().toISOString();
        await this._store.put(record);
        return record;
      }
    }
    return null;
  }

  async list() {
    return this._store.getAll();
  }

  async revoke(id) {
    const record = await this._store.get(id);
    if (!record) return null;
    record.isActive = false;
    return this._store.put(record);
  }

  async delete(id) {
    return this._store.delete(id);
  }
}
