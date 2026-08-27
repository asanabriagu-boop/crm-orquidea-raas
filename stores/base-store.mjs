/**
 * base-store.mjs — Store base con persistencia SQLite
 *
 * Todos los stores del CRM heredan de aquí.
 * Usa sql.js (SQLite WASM) — cero dependencias nativas.
 *
 * Soporta multi-tenant mediante tenantId.
 * Migración automática desde JSON legacy al primer arranque.
 */

import { getDb, ensureTable, scheduleSave, migrateFromJson } from "./db.mjs";

let _migrated = false;

const ALLOWED_TABLES = new Set([
  "contacts", "deals", "conversations", "usage",
  "tenants", "products", "carts", "payments", "api_keys",
]);
const ALLOWED_ORDER_COLUMNS = new Set([
  "created_at", "updated_at", "id", "tenant_id", "data",
]);

export class BaseStore {
  constructor(name, tenantId = null) {
    if (!ALLOWED_TABLES.has(name)) {
      throw new Error(`Table name '${name}' not allowed`);
    }
    this.name = name;
    this.tenantId = tenantId || "";
    this._loaded = false;
  }

  _sanitizeOrderBy(orderBy) {
    if (!orderBy) return "created_at DESC";
    if (ALLOWED_ORDER_COLUMNS.has(orderBy)) return orderBy;
    return "created_at DESC";
  }

  async _ensureLoaded() {
    if (this._loaded) return;
    // Migración única al cargar el primer store
    if (!_migrated) {
      _migrated = true;
      await migrateFromJson();
    }
    await ensureTable(this.name);
    this._loaded = true;
  }

  _toModel(row) {
    if (!row) return null;
    try {
      return { id: row[0], ...JSON.parse(row[2]) };
    } catch {
      return { id: row[0] };
    }
  }

  async getAll({ limit, offset, orderBy } = {}) {
    await this._ensureLoaded();
    const db = await getDb();
    let sql = `SELECT id, tenant_id, data FROM "${this.name}" WHERE tenant_id = ?`;
    const params = [this.tenantId];

    sql += ` ORDER BY ${this._sanitizeOrderBy(orderBy)}`;
    if (limit) { sql += " LIMIT ?"; params.push(limit); }
    if (offset) { sql += " OFFSET ?"; params.push(offset); }

    const result = db.exec(sql, params);
    if (!result.length) return [];
    return result[0].values.map(r => this._toModel(r));
  }

  async get(id) {
    await this._ensureLoaded();
    const db = await getDb();
    const result = db.exec(
      `SELECT id, tenant_id, data FROM "${this.name}" WHERE id = ? AND tenant_id = ?`,
      [id, this.tenantId]
    );
    if (!result.length || !result[0].values.length) return null;
    return this._toModel(result[0].values[0]);
  }

  async put(item) {
    await this._ensureLoaded();
    const db = await getDb();
    const data = JSON.stringify(item);
    db.run(
      `INSERT OR REPLACE INTO "${this.name}" (id, tenant_id, data) VALUES (?, ?, ?)`,
      [item.id, this.tenantId, data]
    );
    scheduleSave();
    return item;
  }

  async putMany(items) {
    if (!items.length) return items;
    await this._ensureLoaded();
    const db = await getDb();
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO "${this.name}" (id, tenant_id, data) VALUES (?, ?, ?)`
    );
    for (const item of items) {
      stmt.run([item.id, this.tenantId, JSON.stringify(item)]);
    }
    stmt.free();
    scheduleSave();
    return items;
  }

  async delete(id) {
    await this._ensureLoaded();
    const db = await getDb();
    const result = db.exec(
      `SELECT COUNT(*) AS c FROM "${this.name}" WHERE id = ? AND tenant_id = ?`,
      [id, this.tenantId]
    );
    const existed = result.length > 0 && result[0].values[0][0] > 0;
    if (existed) {
      db.run(`DELETE FROM "${this.name}" WHERE id = ? AND tenant_id = ?`, [id, this.tenantId]);
      scheduleSave();
    }
    return existed;
  }

  async find(fn) {
    await this._ensureLoaded();
    const all = await this.getAll();
    return all.filter(fn);
  }

  async count() {
    await this._ensureLoaded();
    const db = await getDb();
    const result = db.exec(
      `SELECT COUNT(*) AS c FROM "${this.name}" WHERE tenant_id = ?`,
      [this.tenantId]
    );
    if (!result.length) return 0;
    return result[0].values[0][0];
  }

  /**
   * Busca items donde data LIKE %query% en una propiedad específica.
   * Útil para búsqueda textual rápida sin cargar todo a JS.
   */
  async searchInProperty(property, query) {
    await this._ensureLoaded();
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(item => {
      const val = item[property];
      if (!val) return false;
      return String(val).toLowerCase().includes(q);
    });
  }

  /**
   * Limpia todos los registros del tenant actual (útil en tests).
   */
  async clear() {
    await this._ensureLoaded();
    const db = await getDb();
    db.run(`DELETE FROM "${this.name}" WHERE tenant_id = ?`, [this.tenantId]);
    scheduleSave();
  }

  /**
   * Fuerza flush a disco inmediato.
   */
  async flush() {
    const { flushDb } = await import("./db.mjs");
    flushDb();
  }
}
