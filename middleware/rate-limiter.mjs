/**
 * rate-limiter.mjs — Rate limiters: sliding-window por API key e IP
 *
 * Dos tipos:
 *   1. rateLimiter() — basado en plan de suscripción (API key)
 *   2. ipRateLimiter() — basado en IP (login, webhooks, webchat)
 *
 * Uso:
 *   import { rateLimiter, ipRateLimiter } from "./middleware/rate-limiter.mjs";
 *   app.get("/api/v1/contacts", requireApiKey, rateLimiter(), handler);
 *   app.post("/api/admin/login", ipRateLimiter({ maxRequests: 10, windowMs: 15 * 60 * 1000 }), handler);
 */
import { getPlan } from "../config/subscriptions.mjs";

// Ventana en milisegundos (1 minuto)
const WINDOW_MS = 60 * 1000;

// Almacén en memoria: { apiKeyId: [{ timestamp }, ...] }
const _windows = new Map();

// Cleanup periódico cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, entries] of _windows) {
    const valid = entries.filter(t => now - t < WINDOW_MS);
    if (valid.length === 0) {
      _windows.delete(key);
    } else {
      _windows.set(key, valid);
    }
  }
}, 5 * 60 * 1000);

/**
 * Factory que crea middleware de rate limiting.
 * @param {Object} options
 * @param {number} options.maxRequests - Máximo de requests permitidos (opcional, por defecto usará el plan)
 * @param {string} options.message - Mensaje de error personalizado
 */
export function rateLimiter(options = {}) {
  return async (req, res, next) => {
    try {
      const apiKeyId = req.apiKey?.id;
      const tenantSlug = req.apiKey?.tenantSlug;

      if (!apiKeyId) {
        return res.status(401).json({ error: "API key no identificada" });
      }

      // Determinar límite: opción explícita o basado en plan
      let maxRequests = options.maxRequests;
      if (!maxRequests && tenantSlug) {
        // Buscar plan del tenant desde TenantStore
        try {
          const { TenantStore } = await import("../stores/tenant-store.mjs");
          const ts = TenantStore.getInstance();
          const tenant = await ts.findBySlug(tenantSlug);
          if (tenant) {
            const plan = getPlan(tenant.plan);
            // Rate limit por minuto: 1/10 del límite mensual, mínimo 10
            maxRequests = plan.maxReasonings === Infinity
              ? 1000
              : Math.max(10, Math.round(plan.maxReasonings / 100));
          }
        } catch (err) {
          console.warn("[rate-limiter] tenant plan lookup failed:", err.message);
        }
      }

      if (!maxRequests) maxRequests = 10; // default mínimo

      const now = Date.now();
      let entries = _windows.get(apiKeyId) || [];

      // Filtrar entradas dentro de la ventana
      entries = entries.filter(t => now - t < WINDOW_MS);

      if (entries.length >= maxRequests) {
        const retryAfter = Math.ceil((entries[0] + WINDOW_MS - now) / 1000);
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          error: `Límite de requests excedido. Intenta de nuevo en ${retryAfter} segundos.`,
          retryAfter,
          limit: maxRequests,
          windowMs: WINDOW_MS,
        });
      }

      entries.push(now);
      _windows.set(apiKeyId, entries);

      // Headers de rate limit
      res.set("X-RateLimit-Limit", String(maxRequests));
      res.set("X-RateLimit-Remaining", String(maxRequests - entries.length));
      res.set("X-RateLimit-Reset", String(Math.ceil((entries[0] + WINDOW_MS) / 1000)));

      next();
    } catch (err) {
      console.error("❌ rate-limiter error:", err.message);
      next(); // ante error, dejar pasar
    }
  };
}

/**
 * Reinicia todos los rate limiters (útil en tests).
 */
export function resetRateLimiter() {
  _windows.clear();
}

// ── IP-based rate limiter (login, webhooks, webchat) ──
const _ipWindows = new Map();

// Cleanup periódico para IP windows
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _ipWindows) {
    if (now - entry.resetAt > 0) {
      _ipWindows.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limiter por IP con ventana fija.
 *
 * @param {Object} options
 * @param {number} options.maxRequests - Máximo de requests permitidos en la ventana (default: 10)
 * @param {number} options.windowMs - Ventana en milisegundos (default: 60000 = 1 minuto)
 * @param {string} options.message - Mensaje de error (default: "Demasiadas solicitudes")
 */
export function ipRateLimiter(options = {}) {
  const maxRequests = options.maxRequests || 10;
  const windowMs = options.windowMs || 60 * 1000;
  const message = options.message || "Demasiadas solicitudes. Intenta de nuevo más tarde.";

  return (req, res, next) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || "unknown";
      const now = Date.now();
      let entry = _ipWindows.get(ip);

      if (!entry || now - entry.resetAt >= windowMs) {
        // Nueva ventana
        entry = { count: 1, resetAt: now + windowMs };
        _ipWindows.set(ip, entry);
        res.set("X-RateLimit-Limit", String(maxRequests));
        res.set("X-RateLimit-Remaining", String(maxRequests - 1));
        res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
        return next();
      }

      entry.count++;

      if (entry.count > maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          error: message,
          retryAfter,
          limit: maxRequests,
          windowMs,
        });
      }

      res.set("X-RateLimit-Limit", String(maxRequests));
      res.set("X-RateLimit-Remaining", String(maxRequests - entry.count));
      res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
      next();
    } catch (err) {
      console.error("❌ ip-rate-limiter error:", err.message);
      next();
    }
  };
}
