/**
 * db.mjs — SQLite connection singleton (sql.js WASM)
 *
 * No requiere native addons. Usa sql.js que corre SQLite compilado a WASM.
 * La base se guarda en data/crm.db con debounce de 500ms.
 *
 * Migración automática desde JSON legacy al primer arranque.
 */

import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "crm.db");

let _db = null;
let _saveTimeout = null;
let _flushInterval = null;

const ALLOWED_TABLES = new Set([
  "contacts", "deals", "conversations", "usage",
  "tenants", "products", "carts", "payments", "api_keys",
]);

/**
 * Obtiene (o inicializa) la conexión SQLite singleton.
 */
export async function getDb() {
  if (_db) return _db;
  const SQL = await initSqlJs();
  try {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
    console.log(`🗄️ SQLite: base existente cargada (${buf.length} bytes)`);
  } catch {
    _db = new SQL.Database();
    console.log("🗄️ SQLite: nueva base creada");
  }
  _db.run("PRAGMA synchronous=NORMAL");

  // Safety net flush cada 5 segundos
  if (!_flushInterval) {
    _flushInterval = setInterval(() => {
      if (_db) flushDb();
    }, 5000);
    _flushInterval.unref();
  }

  return _db;
}

/**
 * Asegura que una tabla existe. Crea si no.
 */
export async function ensureTable(name) {
  if (!ALLOWED_TABLES.has(name)) {
    throw new Error(`Table name '${name}' not allowed`);
  }
  const db = await getDb();
  db.run(`CREATE TABLE IF NOT EXISTS "${name}" (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT '',
    data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  // Índices para queries comunes
  db.run(`CREATE INDEX IF NOT EXISTS idx_${name}_tenant ON "${name}"(tenant_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_${name}_created ON "${name}"(created_at)`);
}

/**
 * Guarda la base en disco (debounced 200ms).
 */
export function scheduleSave() {
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(flushDb, 200);
}

/**
 * Guarda la base en disco inmediato (síncrono).
 */
export function flushDb() {
  if (_saveTimeout) {
    clearTimeout(_saveTimeout);
    _saveTimeout = null;
  }
  if (!_db) return;
  try {
    const buf = _db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(buf));
  } catch (err) {
    console.error("❌ SQLite flush error:", err.message);
  }
}

// Flush en salida del proceso
process.on("exit", flushDb);

/**
 * Migra datos desde archivos JSON legacy a SQLite.
 * Lee data/*.json y data/{tenant}/*.json, inserta en tablas.
 * Saltar si la tabla ya tiene datos.
 *
 * La migración se ejecuta UNA SOLA VEZ por base (marcada con PRAGMA user_version),
 * no por arranque de proceso. Las tablas vacías (products/carts/payments/api_keys)
 * son features nuevas sin JSON legacy → se dejan vacías silenciosamente.
 */
const MIGRATION_VERSION = 1;

export async function migrateFromJson() {
  const db = await getDb();

  // Marcador persistente: si ya migramos esta base, no re-ejecutar.
  const versionRes = db.exec("PRAGMA user_version");
  const currentVersion = versionRes.length > 0 ? versionRes[0].values[0][0] : 0;
  if (currentVersion >= MIGRATION_VERSION) {
    return 0;
  }

  const stores = ["contacts", "deals", "conversations", "usage", "tenants",
    "products", "carts", "payments", "api_keys"];

  // Detectar subdirectorios de tenants
  const tenantDirs = [];
  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "faiss-mototractor" && entry.name !== "whatsapp-auth") {
        tenantDirs.push(entry.name);
      }
    }
  } catch (err) {
    console.debug("[db] data dir read (expected if no JSON legacy):", err.message);
  }

  let totalMigrated = 0;

  for (const storeName of stores) {
    await ensureTable(storeName);

    // Saltar si ya hay datos
    const existing = db.exec(`SELECT COUNT(*) AS c FROM "${storeName}"`);
    if (existing.length > 0 && existing[0].values[0][0] > 0) {
      continue;
    }

    // Migrar default (tenant_id = '')
    const defaultPath = path.join(DATA_DIR, `${storeName}.json`);
    if (fs.existsSync(defaultPath)) {
      try {
        const raw = fs.readFileSync(defaultPath, "utf-8");
        const data = JSON.parse(raw);
        const items = Object.values(data);
        let count = 0;
        const stmt = db.prepare(`INSERT OR IGNORE INTO "${storeName}" (id, tenant_id, data) VALUES (?, '', ?)`);
        for (const item of items) {
          if (item && item.id) {
            stmt.run([item.id, JSON.stringify(item)]);
            count++;
          }
        }
        stmt.free();
        if (count > 0) {
          console.log(`  📄 ${storeName}: ${count} registros migrados (default)`);
          totalMigrated += count;
        }
      } catch (err) {
        console.debug("[db] default store migration (expected if no JSON):", err.message);
      }
    }

    // Migrar tenant-specific
    for (const tenantId of tenantDirs) {
      const tenantPath = path.join(DATA_DIR, tenantId, `${storeName}.json`);
      if (!fs.existsSync(tenantPath)) continue;
      try {
        const raw = fs.readFileSync(tenantPath, "utf-8");
        const data = JSON.parse(raw);
        const items = Object.values(data);
        let count = 0;
        const stmt = db.prepare(`INSERT OR IGNORE INTO "${storeName}" (id, tenant_id, data) VALUES (?, ?, ?)`);
        for (const item of items) {
          if (item && item.id) {
            stmt.run([item.id, tenantId, JSON.stringify(item)]);
            count++;
          }
        }
        stmt.free();
        if (count > 0) {
          console.log(`  📄 ${storeName}: ${count} registros migrados (tenant: ${tenantId})`);
          totalMigrated += count;
        }
      } catch (err) {
        console.debug("[db] tenant store migration (expected if no JSON):", err.message);
      }
    }
  }

  // Marcar la migración como hecha en esta base (una sola vez).
  db.run(`PRAGMA user_version = ${MIGRATION_VERSION}`);

  if (totalMigrated > 0) {
    console.log(`✅ Migración JSON → SQLite completa: ${totalMigrated} registros`);
  }
  scheduleSave();
  return totalMigrated;
}
