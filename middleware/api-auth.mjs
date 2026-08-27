/**
 * api-auth.mjs — Middleware de autenticación para API REST (API Keys)
 *
 * Extrae el Bearer token del header Authorization, lo valida contra
 * ApiKeyStore y adjunta la información del tenant a req.tenant.
 *
 * Uso:
 *   import { requireApiKey } from "./middleware/api-auth.mjs";
 *   app.get("/api/v1/contacts", requireApiKey, handler);
 */
import { ApiKeyStore } from "../stores/api-key-store.mjs";

export async function requireApiKey(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Se requiere API key (Bearer token)" });
    }

    const fullKey = authHeader.slice(7).trim();
    if (!fullKey) {
      return res.status(401).json({ error: "API key vacía" });
    }

    const store = ApiKeyStore.getInstance();
    const record = await store.validate(fullKey);

    if (!record) {
      return res.status(401).json({ error: "API key inválida o expirada" });
    }

    // Adjuntar info del tenant al request
    req.apiKey = {
      id: record.id,
      label: record.label,
      tenantSlug: record.tenantSlug,
    };
    req.tenantSlug = record.tenantSlug;

    next();
  } catch (err) {
    console.error("❌ api-auth error:", err.message);
    res.status(500).json({ error: "Error de autenticación" });
  }
}
