/**
 * tenant-auth-store.mjs — Autenticación de tenants (self-serve)
 *
 * Cada tenant tiene email + password para login.
 * Persiste en: data/tenant-auth.json (separado de tenants para seguridad)
 */
import { BaseStore } from "./base-store.mjs";
import crypto from "crypto";

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const ITERATIONS = 100000;
const DIGEST = "sha512";

let _instance = null;

export class TenantAuthStore {
  constructor() {
    this._store = new BaseStore("tenant-auth");
  }

  static getInstance() {
    if (!_instance) _instance = new TenantAuthStore();
    return _instance;
  }

  /**
   * Hash password con PBKDF2.
   */
  _hashPassword(password) {
    const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
    return `${salt}:${hash}`;
  }

  /**
   * Verifica password contra hash almacenado.
   */
  _verifyPassword(password, stored) {
    const [salt, hash] = stored.split(":");
    const verify = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
    return hash === verify;
  }

  /**
   * Crea un registro de auth para un tenant.
   */
  async create({ tenantSlug, email, password, name }) {
    const all = await this._store.getAll();

    // Verificar email único
    const existing = all.find(a => a.email === email);
    if (existing) {
      return { success: false, error: "Este email ya está registrado" };
    }

    const record = {
      id: crypto.randomUUID(),
      tenantSlug,
      email,
      name,
      passwordHash: this._hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    await this._store.put(record);
    return { success: true, record };
  }

  /**
   * Busca por email y verifica password.
   */
  async authenticate(email, password) {
    const all = await this._store.getAll();
    const record = all.find(a => a.email === email);
    if (!record) return null;
    if (!this._verifyPassword(password, record.passwordHash)) return null;
    return record;
  }

  /**
   * Busca por tenantSlug.
   */
  async findByTenant(slug) {
    const all = await this._store.getAll();
    return all.find(a => a.tenantSlug === slug) || null;
  }

  async getAll() {
    return this._store.getAll();
  }
}
