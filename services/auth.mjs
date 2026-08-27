/**
 * auth.mjs — Autenticación simple para rutas de admin
 *
 * Usa JWT para proteger el dashboard administrativo.
 * La contraseña y el secreto vienen de variables de entorno.
 * Valida que los defaults no se usen en producción.
 */

import jwt from "jsonwebtoken";

// ── Validación de seguridad al arrancar ──
const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!JWT_SECRET || JWT_SECRET === "changeme-in-production") {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ CRÍTICO: ADMIN_JWT_SECRET debe cambiarse del default 'changeme-in-production' en producción.");
    process.exit(1);
  } else {
    console.warn("⚠️  ADMIN_JWT_SECRET usa el default 'changeme-in-production'. NO USAR EN PRODUCCIÓN.");
  }
}
if (!ADMIN_PASSWORD || ADMIN_PASSWORD === "admin123") {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ CRÍTICO: ADMIN_PASSWORD debe cambiarse del default 'admin123' en producción.");
    process.exit(1);
  } else {
    console.warn("⚠️  ADMIN_PASSWORD usa el default 'admin123'. NO USAR EN PRODUCCIÓN.");
  }
}

// Fallback para desarrollo si no se setearon
const JWT_SECRET_FINAL = JWT_SECRET || "changeme-in-production";
const ADMIN_PASSWORD_FINAL = ADMIN_PASSWORD || "admin123";
const TOKEN_EXPIRY = "24h";

/**
 * Login: verifica contraseña y devuelve un JWT.
 */
export function login(password) {
  if (password !== ADMIN_PASSWORD_FINAL) {
    return null;
  }
  const token = jwt.sign({ role: "admin", iat: Date.now() }, JWT_SECRET_FINAL, {
    expiresIn: TOKEN_EXPIRY,
  });
  return token;
}

/**
 * Middleware para Express: verifica el token JWT.
 * Espera el token en: Authorization: Bearer <token>
 * o en cookie "token"
 */
export function requireAdmin(req, res, next) {
  let token = null;

  // Intentar de header Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  // Intentar de cookie
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: "Se requiere autenticación. Haz login en /admin" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET_FINAL);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

/**
 * Middleware opcional: verifica si hay admin para páginas HTML.
 * No bloquea, solo setea req.isAdmin.
 */
export function optionalAdmin(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET_FINAL);
      req.isAdmin = true;
    } catch {
      req.isAdmin = false;
    }
  } else {
    req.isAdmin = false;
  }
  next();
}
