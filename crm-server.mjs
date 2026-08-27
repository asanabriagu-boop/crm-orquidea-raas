#!/usr/bin/env node
/**
 * crm-server.mjs — CRM Server con Canales Reales
 *
 * Arranca Express + WhatsApp + Instagram + Bridge al CRM Agent.
 * Sirve QR de WhatsApp como página web para escanear desde el celular.
 *
 * Uso:
 *   node agentes/crm/crm-server.mjs                ← todo
 *   node agentes/crm/crm-server.mjs --no-whatsapp  ← solo Instagram
 *   node agentes/crm/crm-server.mjs --no-instagram ← solo WhatsApp
 *   node agentes/crm/crm-server.mjs --seed         ← fuerza seed
 */

import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import readline from "readline";
import cookieParser from "cookie-parser";
import { ipRateLimiter } from "./middleware/rate-limiter.mjs";
import { SUBSCRIPTION_PLANS, getPlan, getMonthlyPrice } from "./config/subscriptions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.CRM_PORT || 3030;
const NO_WHATSAPP = process.argv.includes("--no-whatsapp");
const NO_INSTAGRAM = process.argv.includes("--no-instagram");
const FORCE_SEED = process.argv.includes("--seed");

// Número de teléfono para pairing code (pasar como argumento o variable de entorno)
const WHATSAPP_PHONE = process.argv.find(a => /^5[0-9]{10,14}$/.test(a)) || process.env.WHATSAPP_PHONE;

// ── Seed data (solo con --seed flag explícito) ──
if (FORCE_SEED) {
  console.log("🌱 Sembrando datos demo...");
  try {
    execSync(`node ${path.join(__dirname, "seed-demo.mjs")} --force`, { encoding: "utf-8" });
  } catch (err) {
    console.log("⚠️  Seed:", err.message.slice(0, 100));
  }
}

// ── Dedup de tenants al arranque (evita slugs repetidos) ──
(async () => {
  try {
    const { TenantStore } = await import("./stores/tenant-store.mjs");
    const ts = TenantStore.getInstance();
    const tenants = await ts.getAll();
    const slugs = new Map();
    const toDelete = [];
    for (const t of tenants) {
      const slug = t.slug || "";
      if (!slug) { toDelete.push(t.id); continue; }
      if (slugs.has(slug)) { toDelete.push(t.id); continue; }
      slugs.set(slug, t.id);
    }
    for (const id of toDelete) {
      await ts._store.delete(id);
    }
    if (toDelete.length > 0) {
      console.log(`🧹 ${toDelete.length} tenant(s) duplicado(s) eliminados`);
    }
  } catch (err) { console.error("[server] tenant dedup error:", err.message); }
})();

// ══════════════════════════════════════════════════════
//  EXPRESS
// ══════════════════════════════════════════════════════

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(cookieParser());

// ── Security Headers (manual, sin dependencias) ──
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// ── CORS ──
const corsOrigins = (process.env.CORS_ORIGIN || "*").split(",").map(s => s.trim());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (corsOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && corsOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Descarga de wa-tablet.cjs para actualizar Termux ──
app.get("/wa-tablet.cjs", (req, res) => {
  const filePath = new URL("channels/wa-tablet.cjs", import.meta.url).pathname;
  res.download(filePath, "wa-tablet.cjs");
});

// ── Landing Page multi-tenant ──
app.get("/", async (req, res) => {
  const { TenantStore } = await import("./stores/tenant-store.mjs");
  const ts = TenantStore.getInstance();
  const tenants = await ts.listActive();

  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CRM Conversacional</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1rem; }
  .container { text-align: center; max-width: 600px; }
  h1 { font-size: 2rem; margin-bottom: 0.5rem; background: linear-gradient(90deg, #2ecc71, #2d5016); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .subtitle { color: #888; margin-bottom: 2rem; font-size: 1rem; }
  .tenants { display: flex; flex-direction: column; gap: 1rem; }
  .tenant-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 1.5rem; text-align: left; display: flex; align-items: center; gap: 1rem; cursor: pointer; transition: all 0.2s; text-decoration: none; color: inherit; }
  .tenant-card:hover { border-color: #2ecc71; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(46, 204, 113, 0.1); }
  .tenant-icon { font-size: 2.5rem; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background: #2a2a2a; border-radius: 12px; }
  .tenant-info h2 { font-size: 1.2rem; margin-bottom: 0.2rem; }
  .tenant-info p { color: #888; font-size: 0.85rem; }
  .tenant-badge { display: inline-block; font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; margin-top: 0.3rem; }
  .badge-prod { background: #1b5e20; color: #a5d6a7; }
  .badge-free { background: #3a3a3a; color: #aaa; }
  .footer { margin-top: 2rem; font-size: 0.8rem; color: #555; }
</style>
</head>
<body>
<div class="container">
  <h1>CRM Conversacional</h1>
  <p class="subtitle">🤖 LangChain + DeepSeek · Multi-tenant</p>
  <div class="tenants">
    ${(() => {
      const moto = tenants.find(t => t.slug === null || t.slug === "mototractor");
      const plan = moto?.plan || "free";
      const planClass = plan === "free" ? "badge-free" : "badge-prod";
      return `<a href="/chat" class="tenant-card">
      <div class="tenant-icon">🏗️</div>
      <div class="tenant-info">
        <h2>Mototractor</h2>
        <p>Soporte Técnico - Servicio al Cliente - Pre ventas - Ventas</p>
        <span class="tenant-badge ${planClass}">● ${plan.charAt(0).toUpperCase() + plan.slice(1)}</span>
      </div>
    </a>`;
    })()}
    ${tenants.filter(t => t.slug !== null && t.slug !== "mototractor").map(t => `
    <a href="/chat/${t.slug}" class="tenant-card">
      <div class="tenant-icon">🌱</div>
      <div class="tenant-info">
        <h2>${t.name}</h2>
        <p>${t.branding?.tagline || ""}</p>
        <span class="tenant-badge badge-prod">● ${t.plan || "professional"}</span>
      </div>
    </a>
    `).join("")}
  </div>
  <div class="footer">CRM Conversacional · ${new Date().getFullYear()}</div>
  <div style="margin-top:1.2rem;display:flex;gap:1rem;justify-content:center;flex-wrap:wrap">
    <a href="/pricing" style="color:#2ecc71;text-decoration:none;font-size:0.85rem">📊 Ver planes y precios</a>
    <a href="/register" style="color:#2ecc71;text-decoration:none;font-size:0.85rem;font-weight:600">🚀 Crear cuenta gratis</a>
  </div>
</div>
</body>
</html>`);
});

// ── Pricing Page ──
app.get("/pricing", (req, res) => {
  const canceled = req.query.canceled === "true";
  const plans = SUBSCRIPTION_PLANS.filter(p => p.id !== "free");

  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Planes — CRM Conversacional</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; display: flex; justify-content: center; padding: 2rem 1rem; }
  .container { text-align: center; max-width: 900px; width: 100%; }
  h1 { font-size: 2rem; margin-bottom: 0.3rem; background: linear-gradient(90deg, #2ecc71, #2d5016); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .subtitle { color: #888; margin-bottom: 0.5rem; }
  .badge-rag { display: inline-block; background: #1b5e20; color: #a5d6a7; padding: 3px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; margin-bottom: 1.5rem; }
  .canceled-msg { background: #3a1a1a; border: 1px solid #e74c3c; color: #e74c3c; padding: 0.8rem; border-radius: 12px; margin-bottom: 1.5rem; font-size: 0.9rem; }
  .plans { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
  .plan-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 1.5rem; width: 260px; text-align: left; display: flex; flex-direction: column; transition: all 0.2s; position: relative; }
  .plan-card:hover { border-color: #2ecc71; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(46,204,113,0.1); }
  .plan-card.featured { border-color: #2ecc71; }
  .plan-card .popular { position: absolute; top: -10px; right: 16px; background: #2ecc71; color: #000; font-size: 0.7rem; font-weight: 700; padding: 3px 10px; border-radius: 8px; }
  .plan-name { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.3rem; }
  .plan-price { font-size: 2rem; font-weight: 700; color: #2ecc71; margin-bottom: 0.2rem; }
  .plan-price span { font-size: 0.9rem; color: #888; font-weight: 400; }
  .plan-desc { color: #888; font-size: 0.8rem; margin-bottom: 1rem; }
  .plan-features { list-style: none; margin-bottom: 1.5rem; flex: 1; }
  .plan-features li { padding: 0.3rem 0; font-size: 0.82rem; color: #ccc; }
  .plan-features li::before { content: "✓ "; color: #2ecc71; font-weight: 700; }
  .plan-btn { background: #2ecc71; color: #000; border: none; padding: 0.7rem; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 0.9rem; text-align: center; text-decoration: none; display: block; }
  .plan-btn:hover { background: #27ae60; }
  .plan-btn.enterprise { background: transparent; border: 1px solid #2ecc71; color: #2ecc71; }
  .plan-btn.enterprise:hover { background: #2ecc71; color: #000; }
  .back-link { display: block; margin-top: 2rem; color: #555; text-decoration: none; font-size: 0.85rem; }
  .back-link:hover { color: #888; }
  .footer { margin-top: 2rem; font-size: 0.75rem; color: #444; }
</style>
</head>
<body>
<div class="container">
  <h1>Planes CRM</h1>
  <p class="subtitle">El primer CRM construido sobre RaaS (Reasoning as a Service)</p>
  <span class="badge-rag">🧠 RaaS — Reasoning as a Service</span>
  ${canceled ? '<div class="canceled-msg">✕ Compra cancelada. Si tienes dudas, escríbenos.</div>' : ""}
  <div class="plans">
    ${plans.map(p => {
      const monthly = getMonthlyPrice(p.id);
      const isPopular = p.id === "professional";
      const isEnterprise = p.id === "enterprise";
      return `<div class="plan-card ${isPopular ? "featured" : ""}">
        ${isPopular ? '<div class="popular">MÁS POPULAR</div>' : ""}
        <div class="plan-name">${p.name}</div>
        <div class="plan-price">$${p.price}<span>/${p.interval === "year" ? "año" : "mes"}</span></div>
        ${p.interval === "year" ? `<div style="font-size:0.75rem;color:#888;margin-bottom:0.5rem">$${monthly}/mes equivalente</div>` : ""}
        <div class="plan-desc">${p.allowedChannels.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(" + ")} · ${p.maxReasonings === Infinity ? "Ilimitados" : `${p.maxReasonings.toLocaleString()}`} razonamientos/mes</div>
        <ul class="plan-features">
          ${p.features.map(f => `<li>${f}</li>`).join("")}
        </ul>
        <a href="/register?plan=${p.id}" class="plan-btn ${isEnterprise ? "enterprise" : ""}" style="text-decoration:none">
          ${isEnterprise ? "Contactar ventas" : "Comenzar ahora"}
        </a>
      </div>`;
    }).join("")}
  </div>
  <a href="/" class="back-link">← Volver al inicio</a>
  <div class="footer">CRM Conversacional · RaaS · ${new Date().getFullYear()}</div>
</div>
</body>
</html>`);
});

// ══════════════════════════════════════════════════════
//  SELF-SERVE REGISTRATION
// ══════════════════════════════════════════════════════

// ── Registration Page ──
app.get("/register", (req, res) => {
  const plan = req.query.plan || "starter";
  const plans = SUBSCRIPTION_PLANS.filter(p => p.id !== "free");
  const selectedPlan = getPlan(plan);
  const error = req.query.error === "true" ? "El email ya está registrado" : "";
  const success = req.query.success === "true";

  if (success) {
    return res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Registro exitoso — CRM</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0f0f0f; color:#e0e0e0; display:flex; justify-content:center; align-items:center; min-height:100vh; }
  .card { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; padding:2rem; max-width:420px; text-align:center; }
  h1 { font-size:1.4rem; margin-bottom:0.5rem; color:#2ecc71; }
  p { color:#888; margin-bottom:1.5rem; line-height:1.5; }
  .btn { background:#2ecc71; color:#000; border:none; padding:0.8rem 1.5rem; border-radius:10px; font-weight:600; cursor:pointer; text-decoration:none; display:inline-block; }
  .btn:hover { background:#27ae60; }
</style>
</head>
<body>
<div class="card">
  <h1>✅ Cuenta creada</h1>
  <p>Tu cuenta ha sido creada exitosamente. Ahora elige tu plan de pago para activar todos los beneficios.</p>
  <a href="/pricing" class="btn">Ver planes</a>
</div>
</body>
</html>`);
  }

  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Registro — CRM Conversacional</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0f0f0f; color:#e0e0e0; display:flex; justify-content:center; align-items:center; min-height:100vh; padding:1rem; }
  .card { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; padding:2rem; max-width:440px; width:100%; }
  h1 { font-size:1.3rem; margin-bottom:0.3rem; }
  .subtitle { color:#888; font-size:0.85rem; margin-bottom:1.5rem; }
  .plan-badge { display:inline-block; background:#1b5e20; color:#a5d6a7; padding:3px 12px; border-radius:12px; font-size:0.75rem; font-weight:600; margin-bottom:1rem; }
  label { display:block; font-size:0.8rem; color:#888; margin-bottom:0.3rem; margin-top:0.8rem; }
  input { width:100%; background:#2a2a2a; border:1px solid #3a3a3a; border-radius:8px; padding:10px 14px; color:#fff; font-size:0.9rem; outline:none; }
  input:focus { border-color:#2ecc71; }
  .btn { width:100%; background:#2ecc71; color:#000; border:none; padding:10px; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.9rem; margin-top:1.2rem; }
  .btn:hover { background:#27ae60; }
  .error { color:#e74c3c; font-size:0.8rem; margin-bottom:0.5rem; }
  .login-link { text-align:center; margin-top:1rem; font-size:0.8rem; color:#555; }
  .login-link a { color:#2ecc71; text-decoration:none; }
  .footer { text-align:center; margin-top:1.2rem; font-size:0.75rem; color:#444; }
  select { width:100%; background:#2a2a2a; border:1px solid #3a3a3a; border-radius:8px; padding:10px 14px; color:#fff; font-size:0.9rem; outline:none; }
</style>
</head>
<body>
<div class="card">
  <h1>🚀 Crear cuenta</h1>
  <p class="subtitle">Comienza tu prueba gratuita. Sin tarjeta.</p>
  ${error ? `<div class="error">${error}</div>` : ""}
  <form action="/api/register" method="POST">
    <label>Nombre completo</label>
    <input type="text" name="name" placeholder="Tu nombre" required>
    <label>Email</label>
    <input type="email" name="email" placeholder="tu@email.com" required>
    <label>Contraseña</label>
    <input type="password" name="password" placeholder="Mínimo 6 caracteres" minlength="6" required>
    <label>Empresa</label>
    <input type="text" name="company" placeholder="Nombre de tu empresa">
    <label>Plan deseado</label>
    <select name="plan">
      ${plans.map(p => `<option value="${p.id}" ${p.id === plan ? "selected" : ""}>${p.name} — $${p.price}/${p.interval === "year" ? "año" : "mes"}</option>`).join("")}
    </select>
    <button class="btn" type="submit">Crear cuenta gratis</button>
  </form>
  <div class="login-link">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></div>
  <div class="footer">CRM Conversacional · RaaS · ${new Date().getFullYear()}</div>
</div>
</body>
</html>`);
});

// ── Registration API ──
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, company, plan } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email y password son requeridos" });
    }

    const { TenantStore } = await import("./stores/tenant-store.mjs");
    const { TenantAuthStore } = await import("./stores/tenant-auth-store.mjs");

    const ts = TenantStore.getInstance();
    const authStore = TenantAuthStore.getInstance();

    // Generar slug único desde el email
    let slug = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!slug) slug = "tenant-" + Date.now();

    // Asegurar slug único
    let existing = await ts.findBySlug(slug);
    if (existing) {
      slug = slug + "-" + Date.now().toString(36);
    }

    // Crear tenant (plan free por defecto, se actualiza al pagar)
    const tenant = await ts.create({
      name: company || name,
      slug,
      plan: "free",
      isActive: true,
      branding: { companyName: company || name, tagline: "CRM Conversacional" },
    });

    // Crear registro de auth
    const authResult = await authStore.create({ tenantSlug: slug, email, password, name });
    if (!authResult.success) {
      // Rollback tenant
      await ts.delete(tenant.id);
      return res.redirect(`/register?plan=${plan || "starter"}&error=true`);
    }

    console.log(`✅ Nuevo registro: ${email} → tenant "${slug}" (plan ${plan || "free"})`);

    // Redirigir al checkout o a success
    if (plan && plan !== "free") {
      return res.redirect(`/api/create-checkout-session?plan=${plan}&tenantSlug=${slug}`);
    }

    res.redirect("/register?success=true");
  } catch (err) {
    console.error("❌ Register error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Tenant Login Page ──
app.get("/login", (req, res) => {
  const error = req.query.error === "true";
  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Iniciar sesión — CRM</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0f0f0f; color:#e0e0e0; display:flex; justify-content:center; align-items:center; min-height:100vh; }
  .card { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; padding:2rem; max-width:360px; width:100%; }
  h1 { font-size:1.3rem; margin-bottom:0.3rem; text-align:center; }
  .subtitle { color:#888; font-size:0.85rem; text-align:center; margin-bottom:1.5rem; }
  label { display:block; font-size:0.8rem; color:#888; margin-bottom:0.3rem; margin-top:0.8rem; }
  input { width:100%; background:#2a2a2a; border:1px solid #3a3a3a; border-radius:8px; padding:10px 14px; color:#fff; font-size:0.9rem; outline:none; }
  input:focus { border-color:#2ecc71; }
  .btn { width:100%; background:#2ecc71; color:#000; border:none; padding:10px; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.9rem; margin-top:1.2rem; }
  .btn:hover { background:#27ae60; }
  .error { color:#e74c3c; font-size:0.8rem; text-align:center; margin-bottom:0.5rem; }
  .register-link { text-align:center; margin-top:1rem; font-size:0.8rem; color:#555; }
  .register-link a { color:#2ecc71; text-decoration:none; }
</style>
</head>
<body>
<div class="card">
  <h1>🔐 Iniciar sesión</h1>
  <p class="subtitle">Accede a tu panel de control</p>
  ${error ? '<div class="error">Email o contraseña incorrectos</div>' : ""}
  <form action="/api/tenant/login" method="POST">
    <label>Email</label>
    <input type="email" name="email" placeholder="tu@email.com" required>
    <label>Contraseña</label>
    <input type="password" name="password" placeholder="Tu contraseña" required>
    <button class="btn" type="submit">Ingresar</button>
  </form>
  <div class="register-link">¿No tienes cuenta? <a href="/register">Regístrate gratis</a></div>
</div>
</body>
</html>`);
});

// ── Tenant Login API (rate-limited: 10 intentos/15min por IP) ──
const tenantLoginLimiter = ipRateLimiter({ maxRequests: 10, windowMs: 15 * 60 * 1000, message: "Demasiados intentos de login. Intenta en 15 minutos." });
app.post("/api/tenant/login", tenantLoginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.redirect("/login?error=true");
    }

    const { TenantAuthStore } = await import("./stores/tenant-auth-store.mjs");
    const authStore = TenantAuthStore.getInstance();
    const record = await authStore.authenticate(email, password);

    if (!record) {
      return res.redirect("/login?error=true");
    }

    // Generar JWT para tenant
    const jwt = await import("jsonwebtoken");
    const secret = process.env.TENANT_JWT_SECRET || process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      console.error("❌ CRÍTICO: Se requiere TENANT_JWT_SECRET o ADMIN_JWT_SECRET en producción.");
      return res.status(500).json({ error: "Configuración del servidor incompleta" });
    }
    const token = jwt.default.sign(
      { role: "tenant", tenantSlug: record.tenantSlug, email, name: record.name },
      secret,
      { expiresIn: "7d" }
    );

    res.cookie("tenant_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect("/dashboard");
  } catch (err) {
    console.error("❌ Tenant login error:", err.message);
    res.redirect("/login?error=true");
  }
});

// ── Tenant Logout ──
app.get("/api/tenant/logout", (req, res) => {
  res.clearCookie("tenant_token");
  res.redirect("/login");
});

// ── Tenant Dashboard ──
app.get("/dashboard", async (req, res) => {
  // Verificar tenant token
  let token = req.cookies?.tenant_token;
  if (!token) return res.redirect("/login");

  let tenantSlug, tenantEmail, tenantName;
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.TENANT_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "tenant-jwt-secret";
    const decoded = jwt.default.verify(token, secret);
    tenantSlug = decoded.tenantSlug;
    tenantEmail = decoded.email;
    tenantName = decoded.name;
  } catch {
    return res.redirect("/login");
  }

  const { TenantStore } = await import("./stores/tenant-store.mjs");
  const ts = TenantStore.getInstance();
  const tenant = await ts.findBySlug(tenantSlug);

  if (!tenant) {
    return res.type("html").send(`<h1>Tenant no encontrado</h1><a href="/login">Volver</a>`);
  }

  const { getUsageSummary } = await import("./services/plan-enforcer.mjs");
  const usage = await getUsageSummary(tenantSlug);

  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  const webhookUrl = `${baseUrl}/api/whatsapp-hook`;
  const chatUrl = `${baseUrl}/chat/${tenantSlug}`;

  const planInfo = getPlan(tenant.plan);

  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard — ${tenant.name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0f0f0f; color:#e0e0e0; padding:1rem; }
  .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem; flex-wrap:wrap; gap:1rem; }
  .header h1 { font-size:1.3rem; }
  .header .sub { color:#888; font-size:0.8rem; }
  .logout { color:#e74c3c; text-decoration:none; font-size:0.8rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:1rem; margin-bottom:2rem; }
  .card { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:1.2rem; }
  .card .label { font-size:0.75rem; color:#888; margin-bottom:0.3rem; }
  .card .value { font-size:1.5rem; font-weight:700; color:#2ecc71; }
  .card .value.infinity { font-size:1.8rem; }
  .section { margin-bottom:2rem; }
  .section h2 { font-size:1rem; margin-bottom:1rem; color:#ccc; }
  .info-row { display:flex; justify-content:space-between; padding:0.6rem 0; border-bottom:1px solid #1a1a1a; font-size:0.85rem; }
  .info-row .val { color:#2ecc71; font-weight:600; }
  .info-row .val.plain { color:#e0e0e0; }
  .copy-box { background:#2a2a2a; border:1px solid #3a3a3a; border-radius:8px; padding:0.8rem 1rem; font-family:monospace; font-size:0.8rem; word-break:break-all; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:0.5rem; }
  .copy-box:hover { border-color:#2ecc71; }
  .copy-btn { background:#2ecc71; color:#000; border:none; padding:4px 10px; border-radius:4px; font-size:0.7rem; font-weight:600; cursor:pointer; white-space:nowrap; }
  .plan-badge { display:inline-block; padding:2px 12px; border-radius:10px; font-size:0.75rem; font-weight:600; }
  .plan-free { background:#3a3a3a; color:#aaa; }
  .plan-starter { background:#1b5e20; color:#a5d6a7; }
  .plan-professional { background:#0d47a1; color:#90caf9; }
  .plan-enterprise { background:#e65100; color:#ffcc80; }
  .usage-bar { height:8px; background:#2a2a2a; border-radius:4px; overflow:hidden; margin-top:0.3rem; }
  .usage-fill { height:100%; background:#2ecc71; border-radius:4px; transition:width 0.3s; }
  .usage-fill.warning { background:#f39c12; }
  .usage-fill.danger { background:#e74c3c; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>🏗️ ${tenant.name}</h1>
    <div class="sub">${tenant.slug} · <span class="plan-badge plan-${tenant.plan}">${tenant.plan}</span></div>
  </div>
  <a href="/api/tenant/logout" class="logout">✕ Cerrar sesión</a>
  <a href="/dashboard/billing" style="color:#2ecc71;text-decoration:none;font-size:0.8rem;margin-left:1rem">💰 Billing</a>
</div>

<div class="grid">
  <div class="card">
    <div class="label">Razonamientos usados</div>
    <div class="value">${usage.razonamientos.usado}</div>
    <div style="font-size:0.75rem;color:#888">de ${usage.razonamientos.limite === Infinity ? "∞ ilimitados" : usage.razonamientos.limite}</div>
    ${usage.razonamientos.limite !== Infinity ? `<div class="usage-bar"><div class="usage-fill ${Math.round((usage.razonamientos.usado/usage.razonamientos.limite)*100) > 70 ? 'warning' : ''}" style="width:${Math.min(Math.round((usage.razonamientos.usado/usage.razonamientos.limite)*100),100)}%"></div></div>` : ""}
  </div>
  <div class="card">
    <div class="label">Contactos</div>
    <div class="value">${usage.contactos.usado}</div>
    <div style="font-size:0.75rem;color:#888">de ${usage.contactos.limite === Infinity ? "∞ ilimitados" : usage.contactos.limite}</div>
  </div>
  <div class="card">
    <div class="label">Deals</div>
    <div class="value">${usage.deals.usado}</div>
    <div style="font-size:0.75rem;color:#888">de ${usage.deals.limite === Infinity ? "∞ ilimitados" : usage.deals.limite}</div>
  </div>
  <div class="card">
    <div class="label">Plan actual</div>
    <div class="value" style="font-size:1.2rem">${planInfo?.name || tenant.plan}</div>
    <div style="font-size:0.75rem;color:#888">${planInfo?.price === 0 ? "Gratuito" : planInfo?.interval === "year" ? `$${planInfo.price}/año` : `$${planInfo?.price}/mes`}</div>
  </div>
</div>

<div class="section">
  <h2>🔗 Tu enlace de chat</h2>
  <div class="copy-box" onclick="navigator.clipboard.writeText('${chatUrl}').then(() => { this.querySelector('.copy-btn').textContent = '✓ Copiado' })">
    <span>${chatUrl}</span>
    <span class="copy-btn">Copiar</span>
  </div>
  <div style="margin-top:0.5rem">
    <a href="${chatUrl}" target="_blank" style="color:#2ecc71;font-size:0.85rem">→ Abrir chat en nueva ventana</a>
  </div>
</div>

<div class="section">
  <h2>📟 Webhook WhatsApp (para tableta)</h2>
  <div class="copy-box" onclick="navigator.clipboard.writeText('${webhookUrl}').then(() => { this.querySelector('.copy-btn').textContent = '✓ Copiado' })">
    <span>${webhookUrl}</span>
    <span class="copy-btn">Copiar</span>
  </div>
  <p style="color:#888;font-size:0.8rem;margin-top:0.5rem">Usa esta URL como CRM_URL en tu tableta Termux.</p>
  <div style="margin-top:0.5rem;background:#1a1a1a;border-radius:8px;padding:0.8rem;font-size:0.8rem">
    <code style="color:#2ecc71">CRM_URL=${baseUrl} node wa-tablet.cjs TU_NUMERO</code>
  </div>
</div>

${planInfo?.price > 0 ? "" : `
<div class="section">
  <h2>⬆️ Mejorar plan</h2>
  <p style="color:#888;font-size:0.85rem;margin-bottom:0.8rem">Activa más contactos, razonamientos y canales.</p>
  <a href="/pricing" style="background:#2ecc71;color:#000;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem;text-decoration:none">Ver planes →</a>
</div>
`}

<div class="section">
  <h2>📋 Detalles de la cuenta</h2>
  <div class="info-row"><span>Email</span><span class="val plain">${tenantEmail}</span></div>
  <div class="info-row"><span>Tenant ID</span><span class="val plain" style="font-family:monospace;font-size:0.75rem">${tenant.slug}</span></div>
  <div class="info-row"><span>Plan</span><span class="val"><span class="plan-badge plan-${tenant.plan}">${tenant.plan}</span></span></div>
  <div class="info-row"><span>Creado</span><span class="val plain">${new Date(tenant.createdAt).toLocaleDateString("es-CO")}</span></div>
  <div class="info-row"><span>Canales</span><span class="val plain">${planInfo?.allowedChannels?.join(", ") || "webchat"}</span></div>
</div>

<div class="section" id="api-keys-section">
  <h2>🔑 API Keys</h2>
  <p style="color:#888;font-size:0.85rem;margin-bottom:0.8rem">Usa estas claves para integrar el CRM con sistemas externos vía API REST.</p>
  <div id="api-keys-list"></div>
  <div style="margin-top:0.8rem;display:flex;gap:0.5rem;flex-wrap:wrap">
    <input type="text" id="new-key-label" placeholder="Ej: Integración Shopify" style="background:#2a2a2a;border:1px solid #3a3a3a;border-radius:8px;padding:8px 12px;color:#fff;font-size:0.85rem;flex:1;min-width:160px;outline:none">
    <button onclick="createApiKey()" style="background:#2ecc71;color:#000;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem">+ Nueva key</button>
  </div>
  <div id="new-key-result" style="display:none;margin-top:0.8rem;background:#1b5e20;border:1px solid #2ecc71;border-radius:8px;padding:1rem">
    <p style="color:#a5d6a7;font-weight:600;margin-bottom:0.3rem">⚠️ Copia esta clave ahora. No se mostrará de nuevo.</p>
    <div class="copy-box" id="new-key-display" style="background:#0f0f0f;border-color:#2ecc71;cursor:pointer" onclick="copyNewKey()">
      <span id="new-key-text"></span>
      <span class="copy-btn" id="new-key-copy-btn">Copiar</span>
    </div>
  </div>
</div>

<script>
async function loadApiKeys() {
  try {
    const res = await fetch('/api/tenant/api-keys');
    if (!res.ok) return;
    const data = await res.json();
    const container = document.getElementById('api-keys-list');
    if (!data.apiKeys || data.apiKeys.length === 0) {
      container.innerHTML = '<p style="color:#555;font-size:0.85rem">No hay API keys creadas.</p>';
      return;
    }
    container.innerHTML = '<div style="display:flex;flex-direction:column;gap:0.5rem">' + data.apiKeys.map(k => {
      const statusDot = k.isActive ? '🟢' : '🔴';
      const statusText = k.isActive ? 'Activa' : 'Revocada';
      const expiresText = k.expiresAt ? ' · Expira: ' + new Date(k.expiresAt).toLocaleDateString('es-CO') : '';
      const lastUsedText = k.lastUsedAt ? ' · Último uso: ' + new Date(k.lastUsedAt).toLocaleString('es-CO') : ' · Sin uso';
      return '<div style="display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:0.7rem 1rem;gap:0.5rem;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:120px">' +
          '<div style="font-weight:600;font-size:0.85rem">' + escapeHtml(k.label) + '</div>' +
          '<div style="color:#888;font-size:0.75rem;font-family:monospace">' + escapeHtml(k.keyPrefix) + '...' + escapeHtml(k.lastDigits) + expiresText + '</div>' +
          '<div style="color:#555;font-size:0.7rem">' + statusDot + ' ' + statusText + lastUsedText + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:0.3rem">' +
          (k.isActive ? '<button onclick="revokeApiKey(\'' + k.id + '\')" style="background:#e67e22;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:0.75rem;cursor:pointer">Revocar</button>' : '') +
          '<button onclick="deleteApiKey(\'' + k.id + '\')" style="background:#e74c3c;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:0.75rem;cursor:pointer">Eliminar</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  } catch(e) {}
}

async function createApiKey() {
  const labelInput = document.getElementById('new-key-label');
  const label = labelInput.value.trim() || 'API Key';
  const resultDiv = document.getElementById('new-key-result');
  const keyText = document.getElementById('new-key-text');
  const copyBtn = document.getElementById('new-key-copy-btn');

  try {
    const res = await fetch('/api/tenant/api-keys/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    const data = await res.json();
    if (data.success) {
      keyText.textContent = data.key;
      resultDiv.style.display = 'block';
      copyBtn.textContent = 'Copiar';
      labelInput.value = '';
      loadApiKeys();
    } else {
      alert('Error: ' + (data.error || 'desconocido'));
    }
  } catch(e) {
    alert('Error al crear API key');
  }
}

function copyNewKey() {
  const keyText = document.getElementById('new-key-text').textContent;
  navigator.clipboard.writeText(keyText).then(() => {
    document.getElementById('new-key-copy-btn').textContent = '✓ Copiado';
  }).catch(() => {});
}

async function revokeApiKey(id) {
  if (!confirm('¿Revocar esta API key? Las integraciones que la usen dejarán de funcionar.')) return;
  try {
    const res = await fetch('/api/tenant/api-keys/revoke/' + id, { method: 'POST' });
    const data = await res.json();
    if (data.success) loadApiKeys();
    else alert('Error: ' + (data.error || 'desconocido'));
  } catch(e) {
    alert('Error al revocar API key');
  }
}

async function deleteApiKey(id) {
  if (!confirm('¿Eliminar esta API key permanentemente?')) return;
  try {
    const res = await fetch('/api/tenant/api-keys/delete/' + id, { method: 'POST' });
    const data = await res.json();
    if (data.success) loadApiKeys();
    else alert('Error: ' + (data.error || 'desconocido'));
  } catch(e) {
    alert('Error al eliminar API key');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadApiKeys();
</script>

<div style="text-align:center;margin-top:2rem;font-size:0.75rem;color:#444">
  CRM Conversacional · RaaS · ${new Date().getFullYear()}
</div>
</body>
</html>`);
});

// ── Tenant usage API (JSON) ──
app.get("/api/tenant/usage", async (req, res) => {
  let token = req.cookies?.tenant_token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.TENANT_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "tenant-jwt-secret";
    const decoded = jwt.default.verify(token, secret);
    const { getUsageSummary } = await import("./services/plan-enforcer.mjs");
    const usage = await getUsageSummary(decoded.tenantSlug);
    res.json({ usage, tenantSlug: decoded.tenantSlug });
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
});

// ── Billing History API (JSON) ──
app.get("/api/tenant/billing-history", async (req, res) => {
  let token = req.cookies?.tenant_token;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.TENANT_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "tenant-jwt-secret";
    const decoded = jwt.default.verify(token, secret);
    const { BillingStore } = await import("./stores/billing-store.mjs");
    const billingStore = BillingStore.getInstance();
    const events = await billingStore.getByTenant(decoded.tenantSlug);
    res.json({ events, tenantSlug: decoded.tenantSlug });
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
});

// ── Change Plan API ──
app.post("/api/tenant/change-plan", async (req, res) => {
  let token = req.cookies?.tenant_token;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.TENANT_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "tenant-jwt-secret";
    const decoded = jwt.default.verify(token, secret);

    const { newPlan } = req.body || {};
    if (!newPlan) return res.status(400).json({ error: "Se requiere newPlan" });

    const { getPlan } = await import("./config/subscriptions.mjs");
    const planDef = getPlan(newPlan);
    if (!planDef || planDef.id === "free") {
      return res.status(400).json({ error: "Plan no válido" });
    }

    const { TenantStore } = await import("./stores/tenant-store.mjs");
    const ts = TenantStore.getInstance();
    const tenant = await ts.findBySlug(decoded.tenantSlug);
    if (!tenant) return res.status(404).json({ error: "Tenant no encontrado" });

    const oldPlan = tenant.plan;
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

    // Crear sesión de checkout para el cambio
    const { stripeGateway } = await import("./payment/stripe-gateway.mjs");
    const result = await stripeGateway.createCheckoutSession({
      planId: newPlan,
      tenantSlug: decoded.tenantSlug,
      baseUrl,
      tenantName: tenant.name || decoded.tenantSlug,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Registrar evento de cambio pendiente
    const { BillingStore } = await import("./stores/billing-store.mjs");
    const billingStore = BillingStore.getInstance();
    await billingStore.create({
      tenantSlug: decoded.tenantSlug,
      type: "subscription_changed",
      planId: newPlan,
      amount: planDef.price,
      status: "pending",
      metadata: { oldPlan, source: "change_plan", sessionId: result.sessionId },
    });

    res.json({ success: true, url: result.url });
  } catch (err) {
    console.error("❌ change-plan error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Cancel Subscription API ──
app.post("/api/tenant/cancel-subscription", async (req, res) => {
  let token = req.cookies?.tenant_token;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.TENANT_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "tenant-jwt-secret";
    const decoded = jwt.default.verify(token, secret);

    const { TenantStore } = await import("./stores/tenant-store.mjs");
    const ts = TenantStore.getInstance();
    const tenant = await ts.findBySlug(decoded.tenantSlug);
    if (!tenant) return res.status(404).json({ error: "Tenant no encontrado" });

    tenant.subscriptionCancelAt = new Date().toISOString();
    await ts._store.put(tenant);

    const { BillingStore } = await import("./stores/billing-store.mjs");
    const billingStore = BillingStore.getInstance();
    await billingStore.create({
      tenantSlug: decoded.tenantSlug,
      type: "subscription_canceled",
      planId: tenant.plan,
      amount: 0,
      status: "completed",
      metadata: { plan: tenant.plan, canceledAt: tenant.subscriptionCancelAt },
    });

    console.log(`🗑️ Tenant "${decoded.tenantSlug}" canceló suscripción (plan: ${tenant.plan})`);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ cancel-subscription error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Billing Dashboard Page ──
app.get("/dashboard/billing", async (req, res) => {
  let token = req.cookies?.tenant_token;
  if (!token) return res.redirect("/");

  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.TENANT_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "tenant-jwt-secret";
    const decoded = jwt.default.verify(token, secret);
    const tenantSlug = decoded.tenantSlug;

    const { TenantStore } = await import("./stores/tenant-store.mjs");
    const ts = TenantStore.getInstance();
    const tenant = await ts.findBySlug(tenantSlug);
    if (!tenant) return res.redirect("/");

    const { getPlan, SUBSCRIPTION_PLANS } = await import("./config/subscriptions.mjs");
    const planInfo = getPlan(tenant.plan);

    const { getUsageSummary } = await import("./services/plan-enforcer.mjs");
    const usage = await getUsageSummary(tenantSlug);

    const { BillingStore } = await import("./stores/billing-store.mjs");
    const billingStore = BillingStore.getInstance();
    const billingEvents = await billingStore.getByTenant(tenantSlug);

    const { getUsageAlerts } = await import("./services/usage-alerts.mjs");
    const alerts = await getUsageAlerts(tenantSlug);

    const otherPlans = SUBSCRIPTION_PLANS.filter(p => p.id !== "free" && p.id !== tenant.plan);
    const planPrice = planInfo?.price || 0;

    res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Billing — ${tenant.name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0f0f0f; color:#e0e0e0; padding:1rem; }
  .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem; }
  .header h1 { font-size:1.3rem; }
  .back { color:#888; text-decoration:none; font-size:0.85rem; }
  .back:hover { color:#fff; }
  .card { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:1.2rem; margin-bottom:1rem; }
  .card h2 { font-size:1rem; margin-bottom:0.8rem; color:#ccc; }
  .plan-name { font-size:1.1rem; font-weight:600; }
  .plan-price { font-size:1.5rem; font-weight:700; color:#2ecc71; }
  .plan-price span { font-size:0.9rem; color:#888; font-weight:400; }
  .features { margin:0.8rem 0; }
  .features li { padding:0.2rem 0; font-size:0.85rem; color:#aaa; list-style:none; }
  .features li::before { content:"✓ "; color:#2ecc71; }
  .usage-bar { height:8px; background:#2a2a2a; border-radius:4px; overflow:hidden; margin:0.5rem 0; }
  .usage-fill { height:100%; background:#2ecc71; border-radius:4px; transition:width 0.3s; }
  .usage-fill.warning { background:#f39c12; }
  .usage-fill.danger { background:#e74c3c; }
  .usage-fill.blocked { background:#e74c3c; }
  .btn { display:inline-block; background:#2ecc71; color:#000; border:none; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.85rem; text-decoration:none; }
  .btn:hover { background:#27ae60; }
  .btn-outline { background:transparent; border:1px solid #555; color:#ccc; padding:7px 15px; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.85rem; text-decoration:none; }
  .btn-outline:hover { border-color:#888; color:#fff; }
  .btn-danger { background:#e74c3c; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.85rem; }
  .btn-danger:hover { background:#c0392b; }
  .plan-badge { display:inline-block; padding:2px 12px; border-radius:10px; font-size:0.75rem; font-weight:600; }
  .plan-free { background:#3a3a3a; color:#aaa; }
  .plan-starter { background:#1b5e20; color:#a5d6a7; }
  .plan-professional { background:#0d47a1; color:#90caf9; }
  .plan-enterprise { background:#e65100; color:#ffcc80; }
  .alert { padding:0.6rem 1rem; border-radius:8px; margin-bottom:0.8rem; font-size:0.85rem; }
  .alert-warning { background:#3a2a00; border:1px solid #f39c12; color:#f39c12; }
  .alert-critical { background:#3a0a0a; border:1px solid #e74c3c; color:#e74c3c; }
  .event-item { display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid #2a2a2a; font-size:0.85rem; }
  .event-item:last-child { border-bottom:none; }
  .event-type { color:#888; font-size:0.75rem; }
  .event-date { color:#555; font-size:0.75rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:0.8rem; margin-bottom:1rem; }
  .stat-card { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:10px; padding:1rem; text-align:center; }
  .stat-card .val { font-size:1.3rem; font-weight:700; color:#2ecc71; }
  .stat-card .lbl { font-size:0.75rem; color:#888; margin-top:0.2rem; }
  .danger-zone { border-color:#e74c3c; }
  .danger-zone h2 { color:#e74c3c; }
</style>
</head>
<body>
<div class="header">
  <a href="/" class="back">← Volver al dashboard</a>
  <h1>💰 Billing</h1>
</div>

${alerts.hasAlerts ? alerts.alerts.map(a =>
  `<div class="alert alert-${a.level}">${a.message} <a href="/pricing" style="color:#2ecc71;font-weight:600">Mejorar plan →</a></div>`
).join("") : ""}

<div class="card">
  <h2>Plan actual</h2>
  <div class="plan-name">${planInfo?.name || tenant.plan} <span class="plan-badge plan-${tenant.plan}">${tenant.plan}</span></div>
  <div class="plan-price">$${planPrice}<span>/${planInfo?.interval === "year" ? "año" : "mes"}</span></div>
  <ul class="features">
    ${planInfo?.features?.map(f => `<li>${f}</li>`).join("") || ""}
  </ul>
</div>

<div class="card">
  <h2>Uso del plan</h2>
  ${["razonamientos", "contactos", "deals"].map(r => {
    const d = usage[r];
    if (!d) return "";
    const pct = d.limite === Infinity ? 0 : d.limite > 0 ? Math.round((d.usado / d.limite) * 100) : 0;
    const barClass = pct >= 100 ? "blocked" : pct > 90 ? "danger" : pct > 70 ? "warning" : "";
    const label = r === "razonamientos" ? "Razonamientos" : r === "contactos" ? "Contactos" : "Deals";
    return `<div style="margin-bottom:0.8rem">
      <div style="display:flex;justify-content:space-between;font-size:0.85rem">
        <span>${label}</span>
        <span>${d.usado}${d.limite === Infinity ? "" : ` / ${d.limite}`}</span>
      </div>
      ${d.limite !== Infinity ? `<div class="usage-bar"><div class="usage-fill ${barClass}" style="width:${Math.min(pct, 100)}%"></div></div>` : ""}
    </div>`;
  }).join("")}
  <div style="margin-top:0.8rem;display:flex;gap:0.5rem;flex-wrap:wrap">
    <a href="/pricing" class="btn">Cambiar plan</a>
  </div>
</div>

<div class="card">
  <h2>Otros planes disponibles</h2>
  ${otherPlans.length > 0 ? otherPlans.map(p =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0;border-bottom:1px solid #2a2a2a">
      <div>
        <strong>${p.name}</strong>
        <div style="font-size:0.8rem;color:#888">$${p.price}/${p.interval === "year" ? "año" : "mes"} · ${p.maxReasonings === Infinity ? "Ilimitados" : p.maxReasonings.toLocaleString()} razonamientos</div>
      </div>
      <a href="/pricing" class="btn-outline" style="font-size:0.8rem">Ver</a>
    </div>`
  ).join("") : '<p style="color:#888;font-size:0.85rem">No hay otros planes disponibles.</p>'}
</div>

<div class="card">
  <h2>Historial de facturación</h2>
  ${billingEvents.length > 0 ? billingEvents.slice(0, 15).map(e =>
    `<div class="event-item">
      <div>
        <div>${e.type.replace(/_/g, " ")}</div>
        <div class="event-type">${e.planId} · $${e.amount} · ${e.status}</div>
      </div>
      <div class="event-date">${new Date(e.createdAt).toLocaleDateString("es-CO")}</div>
    </div>`
  ).join("") : '<p style="color:#888;font-size:0.85rem">No hay eventos de facturación aún.</p>'}
</div>

<div class="card danger-zone">
  <h2>Zona de peligro</h2>
  <p style="font-size:0.85rem;color:#888;margin-bottom:0.8rem">Cancelar tu suscripción desactivará tu plan actual. Podrás seguir usando el servicio con el plan Free.</p>
  <button onclick="cancelSubscription()" class="btn-danger">Cancelar suscripción</button>
</div>

<script>
async function cancelSubscription() {
  if (!confirm('¿Estás seguro de cancelar tu suscripción? Perderás acceso a las funcionalidades del plan actual.')) return;
  if (!confirm('Esta acción no se puede deshacer. ¿Continuar?')) return;
  try {
    const res = await fetch('/api/tenant/cancel-subscription', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('Suscripción cancelada. Serás redirigido al dashboard.');
      window.location.href = '/';
    } else {
      alert('Error: ' + (data.error || 'desconocido'));
    }
  } catch(e) {
    alert('Error al cancelar suscripción');
  }
}
</script>

<div style="text-align:center;margin-top:2rem;font-size:0.75rem;color:#444">
  CRM Conversacional · RaaS · ${new Date().getFullYear()}
</div>
</body>
</html>`);
  } catch (err) {
    console.error("❌ billing dashboard error:", err.message);
    res.redirect("/");
  }
});

// ── Helper: verificar tenant JWT ──
async function resolveTenantFromCookie(req) {
  let token = req.cookies?.tenant_token;
  if (!token) return null;
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.TENANT_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "tenant-jwt-secret";
    return jwt.default.verify(token, secret);
  } catch {
    return null;
  }
}

// ── API Keys: listar ──
app.get("/api/tenant/api-keys", async (req, res) => {
  const decoded = await resolveTenantFromCookie(req);
  if (!decoded) return res.status(401).json({ error: "No autenticado" });

  try {
    const { ApiKeyStore } = await import("./stores/api-key-store.mjs");
    const store = new ApiKeyStore(decoded.tenantSlug);
    const keys = await store.list();
    // Devolver metadata (NUNCA las claves completas)
    const safe = keys.map(k => ({
      id: k.id,
      label: k.label,
      keyPrefix: k.keyPrefix,
      lastDigits: k.lastDigits,
      isActive: k.isActive,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
    }));
    res.json({ apiKeys: safe });
  } catch (err) {
    console.error("❌ api-keys list error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── API Keys: crear ──
app.post("/api/tenant/api-keys/create", async (req, res) => {
  const decoded = await resolveTenantFromCookie(req);
  if (!decoded) return res.status(401).json({ error: "No autenticado" });

  try {
    const { label, expiresAt } = req.body || {};
    const { ApiKeyStore } = await import("./stores/api-key-store.mjs");
    const store = new ApiKeyStore(decoded.tenantSlug);
    const result = await store.create({ label, expiresAt: expiresAt || null });

    console.log(`🔑 API key creada [${decoded.tenantSlug}]: ${result.record.label}`);
    res.json({
      success: true,
      key: result.key,        // ← única vez que se muestra
      apiKey: {
        id: result.record.id,
        label: result.record.label,
        keyPrefix: result.record.keyPrefix,
        lastDigits: result.record.lastDigits,
        createdAt: result.record.createdAt,
      },
    });
  } catch (err) {
    console.error("❌ api-keys create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── API Keys: revocar ──
app.post("/api/tenant/api-keys/revoke/:id", async (req, res) => {
  const decoded = await resolveTenantFromCookie(req);
  if (!decoded) return res.status(401).json({ error: "No autenticado" });

  try {
    const { ApiKeyStore } = await import("./stores/api-key-store.mjs");
    const store = new ApiKeyStore(decoded.tenantSlug);
    await store.revoke(req.params.id);
    console.log(`🔑 API key revocada [${decoded.tenantSlug}]: ${req.params.id.slice(0, 8)}...`);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ api-keys revoke error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── API Keys: eliminar ──
app.post("/api/tenant/api-keys/delete/:id", async (req, res) => {
  const decoded = await resolveTenantFromCookie(req);
  if (!decoded) return res.status(401).json({ error: "No autenticado" });

  try {
    const { ApiKeyStore } = await import("./stores/api-key-store.mjs");
    const store = new ApiKeyStore(decoded.tenantSlug);
    await store.delete(req.params.id);
    console.log(`🔑 API key eliminada [${decoded.tenantSlug}]: ${req.params.id.slice(0, 8)}...`);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ api-keys delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Create Checkout Session (desde redirect GET de registro) ──
app.get("/api/create-checkout-session", async (req, res) => {
  const { plan, tenantSlug } = req.query;
  if (!plan || !tenantSlug) {
    return res.redirect("/pricing");
  }
  // Convertir a POST simulado
  req.body = { plan, tenantSlug };
  // Llamar al mismo handler
  const { TenantStore } = await import("./stores/tenant-store.mjs");
  const ts = TenantStore.getInstance();
  const tenant = await ts.findBySlug(tenantSlug);
  if (!tenant) return res.redirect("/pricing");

  const planDef = getPlan(plan);
  if (!planDef) return res.redirect("/pricing");

  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  const { stripeGateway } = await import("./payment/stripe-gateway.mjs");

  const result = await stripeGateway.createCheckoutSession({
    planId: plan,
    tenantSlug,
    baseUrl,
    tenantName: tenant.name || tenantSlug,
  });

  if (!result.success) {
    return res.redirect("/pricing?error=true");
  }

  if (result._mock) {
    return res.redirect(result.url);
  }
  return res.redirect(result.url);
});

// ── Create Checkout Session (POST) ──
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { plan, tenantSlug } = req.body || {};
    const planId = plan || "starter";
    const slug = tenantSlug || null;

    // Verificar que el plan existe
    const planDef = getPlan(planId);
    if (!planDef) {
      return res.status(400).json({ error: "Plan no válido" });
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const { stripeGateway } = await import("./payment/stripe-gateway.mjs");

    const result = await stripeGateway.createCheckoutSession({
      planId,
      tenantSlug: slug,
      baseUrl,
      tenantName: slug || "Default",
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Redirigir al checkout (Stripe o mock)
    if (result._mock) {
      return res.redirect(result.url);
    }
    return res.json({ url: result.url });
  } catch (err) {
    console.error("❌ create-checkout-session error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Checkout Success ──
app.get("/api/checkout/success", async (req, res) => {
  const { session_id, mock, plan, tenant } = req.query;

  const { BillingStore } = await import("./stores/billing-store.mjs");
  const billingStore = BillingStore.getInstance();

  if (mock === "true") {
    // Modo mock: actualizar plan directamente
    const { TenantStore } = await import("./stores/tenant-store.mjs");
    const ts = TenantStore.getInstance();

    if (tenant) {
      const existing = await ts.findBySlug(tenant);
      if (existing) {
        const oldPlan = existing.plan;
        existing.plan = plan || "starter";
        await ts._store.put(existing);
        console.log(`💰 Mock: tenant "${tenant}" actualizado a plan "${plan}"`);

        // Registrar eventos de billing
        const planDef = (await import("./config/subscriptions.mjs")).getPlan(plan);
        await billingStore.create({
          tenantSlug: tenant,
          type: oldPlan === "free" ? "subscription_created" : "subscription_changed",
          planId: plan,
          amount: planDef ? (planDef.interval === "year" ? planDef.price : planDef.price) : 0,
          status: "completed",
          metadata: { oldPlan, source: "mock_checkout" },
        });
        await billingStore.create({
          tenantSlug: tenant,
          type: "payment_received",
          planId: plan,
          amount: planDef ? (planDef.interval === "year" ? planDef.price : planDef.price) : 0,
          status: "completed",
          metadata: { mock: true, sessionId: session_id },
        });
      }
    } else {
      // Si no hay slug, creamos/actualizamos el default
      const all = await ts.getAll();
      if (all.length > 0) {
        const oldPlan = all[0].plan;
        all[0].plan = plan || "starter";
        await ts._store.put(all[0]);

        const planDef = (await import("./config/subscriptions.mjs")).getPlan(plan);
        await billingStore.create({
          tenantSlug: all[0].slug || "default",
          type: oldPlan === "free" ? "subscription_created" : "subscription_changed",
          planId: plan,
          amount: planDef ? planDef.price : 0,
          status: "completed",
          metadata: { oldPlan, source: "mock_checkout" },
        });
      }
    }
  } else if (session_id) {
    // Stripe real: verificar sesión
    const { stripeGateway } = await import("./payment/stripe-gateway.mjs");
    const session = await stripeGateway.getSession(session_id);
    if (session && session.payment_status === "paid") {
      const { TenantStore } = await import("./stores/tenant-store.mjs");
      const ts = TenantStore.getInstance();
      const slug = session.metadata?.tenantSlug;
      const planId = session.metadata?.planId;
      if (slug && planId) {
        const tenant = await ts.findBySlug(slug);
        if (tenant) {
          const oldPlan = tenant.plan;
          tenant.plan = planId;
          tenant.stripeSubscriptionId = session.subscription || null;
          await ts._store.put(tenant);
          console.log(`💰 Stripe: tenant "${slug}" actualizado a plan "${planId}"`);

          const planDef = (await import("./config/subscriptions.mjs")).getPlan(planId);
          await billingStore.create({
            tenantSlug: slug,
            type: oldPlan === "free" ? "subscription_created" : "subscription_changed",
            planId,
            amount: planDef ? planDef.price : 0,
            status: "completed",
            metadata: { oldPlan, source: "stripe_checkout", sessionId: session_id },
          });
          await billingStore.create({
            tenantSlug: slug,
            type: "payment_received",
            planId,
            amount: planDef ? planDef.price : 0,
            status: "completed",
            metadata: { source: "stripe", sessionId: session_id },
          });
        }
      }
    }
  }

  // Página de éxito
  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pago exitoso — CRM</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 2rem; max-width: 420px; text-align: center; }
  .check { font-size: 3rem; margin-bottom: 1rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #2ecc71; }
  p { color: #888; margin-bottom: 1.5rem; line-height: 1.5; }
  .btn { background: #2ecc71; color: #000; border: none; padding: 0.8rem 1.5rem; border-radius: 10px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
  .btn:hover { background: #27ae60; }
</style>
</head>
<body>
<div class="card">
  <div class="check">✅</div>
  <h1>¡Pago exitoso!</h1>
  <p>Tu plan ha sido activado. Ya puedes disfrutar de todas las funcionalidades de tu suscripción.</p>
  <a href="/" class="btn">Ir al inicio</a>
</div>
</body>
</html>`);
});

// ── Stripe Webhook (rate-limited: 10/min) ──
const stripeLimiter = ipRateLimiter({ maxRequests: 10, windowMs: 60 * 1000, message: "Demasiadas solicitudes." });
app.post("/api/stripe/webhook", stripeLimiter, async (req, res) => {
  try {
    const { stripeGateway } = await import("./payment/stripe-gateway.mjs");
    const sig = req.headers["stripe-signature"];
    const result = await stripeGateway.handleWebhook(req.body, sig);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    if (result.type === "checkout.session.completed") {
      const session = result.data;
      const { TenantStore } = await import("./stores/tenant-store.mjs");
      const { BillingStore } = await import("./stores/billing-store.mjs");
      const billingStore = BillingStore.getInstance();
      const ts = TenantStore.getInstance();
      const slug = session.metadata?.tenantSlug;
      const planId = session.metadata?.planId;
      if (slug && planId) {
        const tenant = await ts.findBySlug(slug);
        if (tenant) {
          const oldPlan = tenant.plan;
          tenant.plan = planId;
          tenant.stripeSubscriptionId = session.subscription || null;
          await ts._store.put(tenant);
          console.log(`💰 Stripe webhook: tenant "${slug}" → plan "${planId}"`);

          const { getPlan } = await import("./config/subscriptions.mjs");
          const planDef = getPlan(planId);
          await billingStore.create({
            tenantSlug: slug,
            type: oldPlan === "free" ? "subscription_created" : "subscription_changed",
            planId,
            amount: planDef ? planDef.price : 0,
            status: "completed",
            metadata: { oldPlan, source: "stripe_webhook", sessionId: session.id },
          });
          await billingStore.create({
            tenantSlug: slug,
            type: "payment_received",
            planId,
            amount: planDef ? planDef.price : 0,
            status: "completed",
            metadata: { source: "stripe_webhook", sessionId: session.id },
          });
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("❌ Stripe webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Login Page ──
app.get("/admin/login", (req, res) => {
  const error = req.query.error === "true";
  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Admin Login — CRM</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 2rem; max-width: 360px; width: 100%; }
  h1 { font-size: 1.3rem; margin-bottom: 1rem; text-align: center; }
  input { width: 100%; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 0.9rem; outline: none; margin-bottom: 1rem; }
  input:focus { border-color: #2ecc71; }
  .btn { width: 100%; background: #2ecc71; color: #000; border: none; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  .btn:hover { background: #27ae60; }
  .error { color: #e74c3c; font-size: 0.8rem; margin-bottom: 0.5rem; }
</style>
</head>
<body>
<div class="card">
  <h1>🔐 Admin CRM</h1>
  ${error ? '<div class="error">Contraseña incorrecta</div>' : ""}
  <form action="/api/admin/login" method="POST">
    <input type="password" name="password" placeholder="Contraseña de administrador" required>
    <button class="btn" type="submit">Ingresar</button>
  </form>
</div>
</body>
</html>`);
});

// ── Admin Login API (rate-limited: 10 intentos/15min por IP) ──
const adminLoginLimiter = ipRateLimiter({ maxRequests: 10, windowMs: 15 * 60 * 1000, message: "Demasiados intentos de login. Intenta en 15 minutos." });
app.post("/api/admin/login", adminLoginLimiter, async (req, res) => {
  const { login } = await import("./services/auth.mjs");
  const { password } = req.body || {};
  const token = login(password);
  if (!token) {
    return res.redirect("/admin/login?error=true");
  }
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.redirect("/admin");
});

// ── Admin Dashboard ──
app.get("/admin", async (req, res) => {
  const { requireAdmin } = await import("./services/auth.mjs");
  // Middleware manual para pages HTML
  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.slice(7);
  }
  if (!token) {
    return res.redirect("/admin/login");
  }
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.ADMIN_JWT_SECRET || "changeme-in-production";
    jwt.default.verify(token, secret);
  } catch {
    return res.redirect("/admin/login");
  }

  const { TenantStore } = await import("./stores/tenant-store.mjs");
  const ts = TenantStore.getInstance();
  const tenants = await ts.getAll();

  // Obtener resúmenes de uso
  const { getUsageSummary } = await import("./services/plan-enforcer.mjs");
  const summaries = [];
  for (const t of tenants) {
    const s = await getUsageSummary(t.slug).catch(() => null);
    summaries.push({ tenant: t, usage: s });
  }

  // Revenue stats
  const { getRevenueStats } = await import("./services/revenue-stats.mjs");
  const revenue = await getRevenueStats().catch(() => null);
  const totalPaying = tenants.filter(t => t.plan && t.plan !== "free").length;
  const planBreakdown = {};
  for (const t of tenants) { planBreakdown[t.plan || "free"] = (planBreakdown[t.plan || "free"] || 0) + 1; }

  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Admin Dashboard — CRM</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .subtitle { color: #888; margin-bottom: 2rem; }
  .section-title { font-size: 1.1rem; margin: 1.5rem 0 0.8rem 0; color: #ccc; border-bottom: 1px solid #2a2a2a; padding-bottom: 0.4rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
  th { text-align: left; padding: 0.7rem 1rem; background: #1a1a1a; border-bottom: 2px solid #2a2a2a; font-size: 0.8rem; color: #888; text-transform: uppercase; }
  td { padding: 0.7rem 1rem; border-bottom: 1px solid #1a1a1a; font-size: 0.9rem; }
  tr:hover td { background: #1a1a1a; }
  .plan-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
  .plan-free { background: #3a3a3a; color: #aaa; }
  .plan-starter { background: #1b5e20; color: #a5d6a7; }
  .plan-professional { background: #0d47a1; color: #90caf9; }
  .plan-enterprise { background: #e65100; color: #ffcc80; }
  .usage-bar { width: 100px; height: 6px; background: #2a2a2a; border-radius: 3px; overflow: hidden; display: inline-block; vertical-align: middle; margin-right: 6px; }
  .usage-fill { height: 100%; background: #2ecc71; border-radius: 3px; transition: width 0.3s; }
  .usage-fill.warning { background: #f39c12; }
  .usage-fill.danger { background: #e74c3c; }
  .btn { background: #2ecc71; color: #000; border: none; padding: 5px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.75rem; text-decoration: none; }
  .btn-outline { background: transparent; border: 1px solid #555; color: #ccc; }
  .btn-outline:hover { border-color: #888; color: #fff; }
  .nav { display: flex; gap: 1rem; margin-bottom: 2rem; }
  .nav a { color: #888; text-decoration: none; font-size: 0.85rem; }
  .nav a:hover { color: #fff; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
  .stat-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 1rem; text-align: center; }
  .stat-card .val { font-size: 1.5rem; font-weight: 700; color: #2ecc71; }
  .stat-card .val.gold { color: #f1c40f; }
  .stat-card .val.red { color: #e74c3c; }
  .stat-card .lbl { font-size: 0.75rem; color: #888; margin-top: 0.2rem; }
  .stat-card .sub { font-size: 0.7rem; color: #555; margin-top: 0.1rem; }
  .tx-item { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid #1a1a1a; font-size: 0.85rem; }
  .tx-item:last-child { border-bottom: none; }
  .tx-amount { font-weight: 600; color: #2ecc71; }
  .tx-tenant { color: #ccc; }
  .tx-date { color: #555; font-size: 0.75rem; }
  .tx-type { color: #888; font-size: 0.75rem; }
  .logout { margin-left: auto; color: #e74c3c; font-size: 0.8rem; }
  .plan-count { display: inline-block; padding: 1px 8px; border-radius: 8px; font-size: 0.7rem; font-weight: 600; margin-left: 4px; vertical-align: middle; }
</style>
</head>
<body>
  <div style="display:flex;align-items:center;margin-bottom:2rem">
    <div>
      <h1>📊 Admin Dashboard</h1>
      <div class="subtitle">Gestión de tenants, planes y uso</div>
    </div>
    <a href="/admin/login" class="logout" style="margin-left:auto">✕ Cerrar sesión</a>
  </div>

  <div class="stats-grid">
    <div class="stat-card"><div class="val">${tenants.length}</div><div class="lbl">Tenants activos</div><div class="sub">${Object.entries(planBreakdown).map(([p, c]) => `${p}: ${c}`).join(" · ")}</div></div>
    <div class="stat-card"><div class="val">${totalPaying}</div><div class="lbl">Clientes pagos</div><div class="sub">${tenants.length > 0 ? Math.round(totalPaying / tenants.length * 100) : 0}% conversión</div></div>
    <div class="stat-card"><div class="val gold">${revenue ? `$${revenue.mrr.toLocaleString()}` : "—"}</div><div class="lbl">MRR (ingreso mensual recurrente)</div><div class="sub">ARR: ${revenue ? `$${revenue.arr.toLocaleString()}/año` : "—"}</div></div>
    <div class="stat-card"><div class="val ${revenue?.churnRate > 0.05 ? "red" : "gold"}">${revenue ? `${(revenue.churnRate * 100).toFixed(1)}%` : "—"}</div><div class="lbl">Churn rate (30d)</div><div class="sub">${revenue?.payingCustomers || 0} clientes pagos</div></div>
  </div>

  ${revenue?.recentTransactions?.length > 0 ? `
  <div class="section-title">Transacciones recientes</div>
  <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:0.8rem 1rem;margin-bottom:2rem">
    ${revenue.recentTransactions.map(tx => `
    <div class="tx-item">
      <div>
        <span class="tx-tenant">${tx.tenantSlug || "default"}</span>
        <span class="tx-type"> · ${tx.type.replace(/_/g, " ")}</span>
      </div>
      <div style="text-align:right">
        <span class="tx-amount">$${tx.amount}</span>
        <div class="tx-date">${new Date(tx.date).toLocaleDateString("es-CO")}</div>
      </div>
    </div>`).join("")}
  </div>` : ""}

  <table>
    <thead>
      <tr><th>Tenant</th><th>Plan</th><th>Razonamientos</th><th>Contactos</th><th>Deals</th><th>Acción</th></tr>
    </thead>
    <tbody>
      ${summaries.map(s => {
        const planClass = `plan-${s.tenant.plan || "free"}`;
        const r = s.usage?.razonamientos;
        const c = s.usage?.contactos;
        const d = s.usage?.deals;
        const rPct = r?.limite === Infinity ? 100 : r?.limite > 0 ? Math.round((r.usado / r.limite) * 100) : 0;
        const cPct = c?.limite === Infinity ? 100 : c?.limite > 0 ? Math.round((c.usado / c.limite) * 100) : 0;
        const dPct = d?.limite === Infinity ? 100 : d?.limite > 0 ? Math.round((d.usado / d.limite) * 100) : 0;
        const barClass = (pct) => pct > 90 ? "danger" : pct > 70 ? "warning" : "";
        return `<tr>
          <td><strong>${s.tenant.name || s.tenant.slug || "Default"}</strong>${s.tenant.slug ? `<br><span style="font-size:0.75rem;color:#555">${s.tenant.slug}</span>` : ""}</td>
          <td><span class="plan-badge ${planClass}">${s.tenant.plan || "free"}</span></td>
          <td>${r ? `<div class="usage-bar"><div class="usage-fill ${barClass(rPct)}" style="width:${Math.min(rPct, 100)}%"></div></div>${r.usado}/${r.limite === Infinity ? "∞" : r.limite}` : "—"}</td>
          <td>${c ? `<div class="usage-bar"><div class="usage-fill ${barClass(cPct)}" style="width:${Math.min(cPct, 100)}%"></div></div>${c.usado}/${c.limite === Infinity ? "∞" : c.limite}` : "—"}</td>
          <td>${d ? `<div class="usage-bar"><div class="usage-fill ${barClass(dPct)}" style="width:${Math.min(dPct, 100)}%"></div></div>${d.usado}/${d.limite === Infinity ? "∞" : d.limite}` : "—"}</td>
          <td><a href="/admin/tenants/${s.tenant.slug || "default"}" class="btn btn-outline">Gestionar</a></td>
        </tr>`;
      }).join("")}
      ${summaries.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:#555;padding:2rem">No hay tenants registrados</td></tr>' : ""}
    </tbody>
  </table>

  <a href="/admin/deals" class="btn" style="display:inline-block;padding:0.5rem 1rem">📌 Ver Pipeline (Kanban)</a>
  <a href="/" class="btn btn-outline" style="display:inline-block;padding:0.5rem 1rem">← Volver al inicio</a>
</body>
</html>`);
});

// ── Admin Pipeline Kanban (deals por etapa) ──
const PIPELINE_STAGES = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];
const STAGE_LABELS = {
  lead: "Lead",
  qualified: "Calificado",
  proposal: "Propuesta",
  negotiation: "Negociación",
  closed_won: "Ganado",
  closed_lost: "Perdido",
};
app.get("/admin/deals", async (req, res) => {
  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) token = req.headers.authorization.slice(7);
  if (!token) return res.redirect("/admin/login");
  try {
    const jwt = await import("jsonwebtoken");
    jwt.default.verify(token, process.env.ADMIN_JWT_SECRET || "changeme-in-production");
  } catch { return res.redirect("/admin/login"); }

  const { TenantStore } = await import("./stores/tenant-store.mjs");
  const { StoreFactory } = await import("./stores/store-factory.mjs");
  const ts = TenantStore.getInstance();
  const tenants = await ts.getAll();

  // Grupo de negocio Mototractor S.A.S.
  const groupMototractor = ["mototractor", "ideagro", "motostabily"];

  // Filtro de tenant: `?tenant=slug` | `?tenant=mototractor-sas` | "all"
  const filter = req.query.tenant || "all";

  // Recolectar deals de todos los tenants
  const allDeals = [];
  for (const t of tenants) {
    const stores = StoreFactory.forTenant(t.slug);
    const deals = await stores.deals.getAll().catch(() => []);
    for (const d of deals) {
      allDeals.push({
        ...d,
        tenantSlug: t.slug,
        tenantName: t.name || t.slug,
        tenantPlan: t.plan || "free",
        group: groupMototractor.includes(t.slug) ? "mototractor-sas" : t.slug,
      });
    }
  }

  // Aplicar filtro
  let visible = allDeals;
  if (filter === "mototractor-sas") visible = allDeals.filter(d => d.group === "mototractor-sas");
  else if (filter !== "all") visible = allDeals.filter(d => d.tenantSlug === filter);

  // Columnas por etapa
  const columns = PIPELINE_STAGES.map(stage => ({
    stage,
    label: STAGE_LABELS[stage] || stage,
    deals: visible.filter(d => d.stage === stage).sort((a, b) => (b.value || 0) - (a.value || 0)),
  }));
  const totalValue = visible.reduce((s, d) => s + (d.value || 0), 0);

  const tenantOptions = [
    { value: "all", label: "Todos los tenants" },
    { value: "mototractor-sas", label: "Mototractor S.A.S (grupo)" },
    ...tenants.map(t => ({ value: t.slug, label: `${t.name || t.slug} (${t.plan || "free"})` })),
  ];

  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pipeline Kanban — CRM</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .subtitle { color: #888; margin-bottom: 1.5rem; }
  .toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  select { background: #1a1a1a; color: #e0e0e0; border: 1px solid #2a2a2a; border-radius: 8px; padding: 0.45rem 0.8rem; font-size: 0.85rem; }
  .nav a { color: #888; text-decoration: none; font-size: 0.85rem; margin-right: 1rem; }
  .nav a:hover { color: #fff; }
  .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; align-items: start; }
  .col { background: #171717; border: 1px solid #2a2a2a; border-radius: 12px; padding: 0.8rem; min-height: 120px; }
  .col-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem; }
  .col-title { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .col-count { background: #2a2a2a; color: #aaa; border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; }
  .card { background: #1f1f1f; border: 1px solid #333; border-left: 3px solid #2ecc71; border-radius: 8px; padding: 0.6rem 0.7rem; margin-bottom: 0.5rem; }
  .card.closed_won { border-left-color: #f1c40f; }
  .card.closed_lost { border-left-color: #e74c3c; opacity: 0.6; }
  .card-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 0.3rem; }
  .card-value { font-size: 0.85rem; font-weight: 700; color: #2ecc71; }
  .card-meta { font-size: 0.72rem; color: #888; margin-top: 0.3rem; }
  .card-tenant { display: inline-block; background: #2a2a2a; border-radius: 6px; padding: 1px 6px; font-size: 0.65rem; color: #bbb; }
  .summary-bar { display: flex; gap: 1.5rem; margin-bottom: 1.5rem; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 0.8rem 1.2rem; flex-wrap: wrap; }
  .summary-bar div span { color: #888; font-size: 0.75rem; }
  .summary-bar div strong { font-size: 1.1rem; color: #2ecc71; margin-left: 0.4rem; }
  .empty { text-align: center; color: #555; padding: 1rem; font-size: 0.78rem; }
</style>
</head>
<body>
  <div style="display:flex;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:1rem">
    <div><h1>📌 Pipeline Kanban</h1><div class="subtitle">Deals organizados por etapa de venta</div></div>
    <div class="nav" style="margin-left:auto"><a href="/admin">← Volver al dashboard</a></div>
  </div>

  <div class="toolbar">
    <form method="get" action="/admin/deals" style="display:flex;align-items:center;gap:0.6rem">
      <label style="font-size:0.85rem;color:#888">Filtrar por tenant:</label>
      <select name="tenant" onchange="this.form.submit()">
        ${tenantOptions.map(o => `<option value="${o.value}" ${o.value === filter ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
    </form>
  </div>

  <div class="summary-bar">
    <div>Deals<span><strong>${visible.length}</strong></span></div>
    <div>Valor pipeline<span><strong>$${totalValue.toLocaleString()}</strong></span></div>
    <div>Tenants<span><strong>${[...new Set(visible.map(d => d.tenantSlug))].length}</strong></span></div>
  </div>

  <div class="board">
    ${columns.map(col => `
      <div class="col">
        <div class="col-head"><span class="col-title">${col.label}</span><span class="col-count">${col.deals.length}</span></div>
        ${col.deals.length > 0 ? col.deals.map(d => `
          <div class="card ${d.stage}">
            <div class="card-title">${d.title || "(sin título)"}</div>
            <div class="card-value">$${(d.value || 0).toLocaleString()}</div>
            <div class="card-meta">
              <span class="card-tenant">${d.tenantName}</span>
              ${d.contactId ? `<br><span>contacto: ${d.contactId.slice(0, 8)}</span>` : ""}
              <br><span>${new Date(d.updatedAt || d.createdAt).toLocaleDateString("es-CO")}</span>
            </div>
          </div>`).join("") : `<div class="empty">Sin deals</div>`}
      </div>`).join("")}
  </div>
</body>
</html>`);
});

// ── Admin Tenant Detail ──
app.get("/admin/tenants/:slug", async (req, res) => {
  let token = req.cookies?.token;
  if (!token) return res.redirect("/admin/login");
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.ADMIN_JWT_SECRET || "changeme-in-production";
    jwt.default.verify(token, secret);
  } catch {
    return res.redirect("/admin/login");
  }

  const slug = req.params.slug === "default" ? null : req.params.slug;
  const { TenantStore } = await import("./stores/tenant-store.mjs");
  const ts = TenantStore.getInstance();
  const tenant = slug ? await ts.findBySlug(slug) : (await ts.getAll())[0];

  if (!tenant) {
    return res.type("html").send(`<!DOCTYPE html><html><body><h1>Tenant no encontrado</h1><a href="/admin">← Volver</a></body></html>`);
  }

  const { getUsageSummary } = await import("./services/plan-enforcer.mjs");
  const usage = await getUsageSummary(slug);

  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${tenant.name} — Admin</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 2rem; max-width: 600px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin-bottom: 0.3rem; }
  .back { color: #888; text-decoration: none; font-size: 0.85rem; display: inline-block; margin-bottom: 1.5rem; }
  .back:hover { color: #fff; }
  .field { margin-bottom: 1rem; }
  .field label { display: block; font-size: 0.75rem; color: #888; margin-bottom: 0.2rem; }
  .field .val { font-size: 1rem; }
  .usage-item { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #1a1a1a; }
  .usage-item .num { color: #2ecc71; font-weight: 600; }
  form { margin-top: 1rem; }
  select, button { background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 0.85rem; }
  button { background: #2ecc71; color: #000; font-weight: 600; cursor: pointer; border: none; }
  button:hover { background: #27ae60; }
  .note { font-size: 0.8rem; color: #888; margin-top: 0.5rem; }
</style>
</head>
<body>
  <a href="/admin" class="back">← Dashboard</a>
  <h1>${tenant.name || "Default"}</h1>
  <p style="color:#888;margin-bottom:1.5rem;font-size:0.85rem">slug: ${tenant.slug || "default"} · plan: ${tenant.plan}</p>

  <div class="field"><label>Uso de razonamientos</label><div class="val">${usage.razonamientos.usado} / ${usage.razonamientos.limite === Infinity ? "∞" : usage.razonamientos.limite}</div></div>
  <div class="field"><label>Contactos creados</label><div class="val">${usage.contactos.usado} / ${usage.contactos.limite === Infinity ? "∞" : usage.contactos.limite}</div></div>
  <div class="field"><label>Deals creados</label><div class="val">${usage.deals.usado} / ${usage.deals.limite === Infinity ? "∞" : usage.deals.limite}</div></div>

  <form action="/api/admin/update-plan" method="POST">
    <input type="hidden" name="tenantSlug" value="${slug || ""}">
    <label style="font-size:0.85rem;color:#888;display:block;margin-bottom:0.3rem">Cambiar plan</label>
    <select name="plan">
      ${SUBSCRIPTION_PLANS.map(p => `<option value="${p.id}" ${p.id === tenant.plan ? "selected" : ""}>${p.name} ($${p.price})</option>`).join("")}
    </select>
    <button type="submit">Actualizar</button>
  </form>

  <form action="/api/admin/reset-usage" method="POST" style="margin-top:0.5rem">
    <input type="hidden" name="tenantSlug" value="${slug || ""}">
    <button type="submit" style="background:#e74c3c">Resetear contadores de uso</button>
  </form>
  <div class="note">El reseteo manual es útil para pruebas o para clientes que excedieron su cuota.</div>
</body>
</html>`);
});

// ── Admin Update Plan API ──
app.post("/api/admin/update-plan", async (req, res) => {
  let token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    const jwt = await import("jsonwebtoken");
    jwt.default.verify(token, process.env.ADMIN_JWT_SECRET || "changeme-in-production");
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }

  const { tenantSlug, plan } = req.body || {};
  const slug = tenantSlug || null;
  const planId = plan || "free";

  const { TenantStore } = await import("./stores/tenant-store.mjs");
  const ts = TenantStore.getInstance();
  const tenant = slug ? await ts.findBySlug(slug) : (await ts.getAll())[0];
  if (!tenant) return res.status(404).json({ error: "Tenant no encontrado" });

  tenant.plan = planId;
  await ts._store.put(tenant);
  console.log(`🔧 Admin: tenant "${slug || "default"}" → plan "${planId}"`);
  res.redirect(`/admin/tenants/${slug || "default"}`);
});

// ── Admin Reset Usage API ──
app.post("/api/admin/reset-usage", async (req, res) => {
  let token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    const jwt = await import("jsonwebtoken");
    jwt.default.verify(token, process.env.ADMIN_JWT_SECRET || "changeme-in-production");
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }

  const { tenantSlug } = req.body || {};
  const slug = tenantSlug || null;
  const { UsageStore } = await import("./stores/usage-store.mjs");
  const us = UsageStore.getInstance(slug);
  await us.resetResource("all");
  console.log(`🔧 Admin: usage reseteado para tenant "${slug || "default"}"`);
  res.redirect(`/admin/tenants/${slug || "default"}`);
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    channels: {
      whatsapp: NO_WHATSAPP ? "disabled" : "starting",
      instagram: NO_INSTAGRAM ? "disabled" : "configured",
    },
    tunnel: process.env.BASE_URL || null,
  });
});

app.get("/api/stats", async (req, res) => {
  const { ContactStore } = await import("./stores/contact-store.mjs");
  const { DealStore } = await import("./stores/deal-store.mjs");
  const { ConversationStore } = await import("./stores/conversation-store.mjs");
  const { StoreFactory } = await import("./stores/store-factory.mjs");
  const { TenantStore } = await import("./stores/tenant-store.mjs");

  const tenantSlug = req.query.tenant || null;
  let contacts, deals, convs, pipeline;

  if (tenantSlug) {
    const stores = StoreFactory.forTenant(tenantSlug);
    contacts = await stores.contacts.count();
    deals = await stores.deals.count();
    convs = await stores.conversations.count();
    pipeline = await stores.deals.getPipelineSummary();
  } else {
    contacts = await ContactStore.getInstance().count();
    deals = await DealStore.getInstance().count();
    convs = await ConversationStore.getInstance().count();
    pipeline = await DealStore.getInstance().getPipelineSummary();
  }
  res.json({ contacts, deals, conversations: convs, pipeline });
});

// ── Página de escaneo WhatsApp ──
app.get("/whatsapp", async (req, res) => {
  const { getQRData, getWhatsAppStatus } = await import("./channels/whatsapp-channel.mjs");
  const status = getWhatsAppStatus();
  const qrData = getQRData();

  // Si no hay QR y no está conectado, auto-refresh
  const autoRefresh = !status.connected && !qrData ? '<meta http-equiv="refresh" content="3">' : "";

  let qrImage = "";
  if (qrData?.qr) {
    try {
      const QR = (await import("qrcode")).default;
      qrImage = await QR.toDataURL(qrData.qr, { width: 350, margin: 2 });
    } catch {
      qrImage = "";
    }
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp CRM</title>
  ${autoRefresh}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #121212; color: #e0e0e0; display: flex;
      justify-content: center; align-items: center; min-height: 100vh;
    }
    .container {
      text-align: center; padding: 2rem; max-width: 500px;
    }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; color: #25D366; }
    .subtitle { color: #888; margin-bottom: 2rem; font-size: 0.95rem; }
    .qr-box {
      background: white; padding: 1.5rem; border-radius: 16px;
      display: inline-block; margin-bottom: 1.5rem;
      box-shadow: 0 8px 32px rgba(37, 211, 102, 0.15);
    }
    .qr-box img { display: block; max-width: 100%; height: auto; }
    .connected { color: #25D366; font-size: 1.2rem; font-weight: bold; }
    .waiting { color: #FFA726; font-size: 1.1rem; }
    .steps {
      text-align: left; background: #1e1e1e; padding: 1.2rem 1.5rem;
      border-radius: 12px; margin-top: 1.5rem;
    }
    .steps ol { padding-left: 1.2rem; }
    .steps li { margin-bottom: 0.5rem; color: #ccc; font-size: 0.9rem; }
    .status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
    .dot-green { background: #25D366; }
    .dot-yellow { background: #FFA726; }
    .dot-red { background: #ef5350; }
    .refresh-btn {
      background: #25D366; color: #000; border: none; padding: 0.7rem 2rem;
      border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 1rem;
      text-decoration: none; display: inline-block;
    }
    .footer { margin-top: 1.5rem; font-size: 0.8rem; color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📱 WhatsApp CRM</h1>
    <p class="subtitle">Escanea con WhatsApp para conectar tu CRM</p>

    ${!NO_WHATSAPP && status.connected ? `
      <div class="connected">✅ Conectado: ${status.user?.name || status.user?.id || "WhatsApp"}</div>
    ` : !NO_WHATSAPP && qrImage ? `
      <div class="qr-box"><img src="${qrImage}" alt="QR Code"></div>
      <div class="waiting">⏳ Esperando escaneo...</div>
      <div class="steps">
        <strong>Pasos:</strong>
        <ol>
          <li>Abre WhatsApp en tu celular</li>
          <li>Toca los 3 puntos (⋮) → <strong>Dispositivos vinculados</strong></li>
          <li>Toca <strong>Vincular dispositivo</strong></li>
          <li>Apunta la cámara al código QR</li>
        </ol>
      </div>
      <a href="/whatsapp" class="refresh-btn">🔄 Refrescar QR</a>
    ` : !NO_WHATSAPP ? `
      <div class="waiting">⏳ Generando QR...</div>
      <div class="steps">
        <p style="color:#888">Espera unos segundos mientras se genera el código QR.</p>
      </div>
      <a href="/whatsapp" class="refresh-btn">🔄 Refrescar</a>
    ` : `
      <div class="waiting">⚪ WhatsApp desactivado</div>
    `}

    <div style="margin-top: 1rem;">
      <span class="status-dot ${status.connected ? 'dot-green' : qrData ? 'dot-yellow' : 'dot-red'}"></span>
      Estado: ${status.connected ? "Conectado" : qrData ? "Esperando QR" : "Desconectado"}
    </div>

    <div class="footer">CRM Conversacional — LangChain + DeepSeek</div>
  </div>
</body>
</html>`;
  res.type("html").send(html);
});

// ── Instagram Webhook ──
if (!NO_INSTAGRAM) {
  const { getInstagramWebhookHandler, onInstagramMessage } = await import(
    "./channels/instagram-channel.mjs"
  );
  const { processIncomingMessage } = await import("./channels/crm-bridge.mjs");

  const ig = getInstagramWebhookHandler();
  app.get(ig.path, (req, res) => ig.verify(req, res));
  app.post(ig.path, (req, res) => ig.handleMessage(req, res));
  onInstagramMessage(processIncomingMessage);
}

// ── Mock Checkout (simula Wompi/Epulpay) ──
app.get("/mock-checkout/:paymentId", async (req, res) => {
  const { PaymentStore } = await import("./stores/payment-store.mjs");
  const { TenantStore } = await import("./stores/tenant-store.mjs");

  // Buscar el payment en todos los tenants
  const tenantStore = TenantStore.getInstance();
  const tenants = await tenantStore.listActive();
  let payment = null;
  let tenant = null;

  for (const t of tenants) {
    const ps = new PaymentStore(t.slug);
    const all = await ps.getAll();
    payment = all.find(p => p.id === req.params.paymentId);
    if (payment) { tenant = t; break; }
  }

  if (!payment) {
    // Fallback: buscar en default tenant
    const ps = new PaymentStore(null);
    const all = await ps.getAll();
    payment = all.find(p => p.id === req.params.paymentId);
  }

  if (!payment) {
    return res.type("html").send(`<!DOCTYPE html><html><body><h1>Pago no encontrado</h1><p>ID: ${req.params.paymentId}</p></body></html>`);
  }

  const color = "#2d5016";
  const company = "Mototractor";

  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pagar — ${company}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1rem; }
  .card { background: white; border-radius: 16px; padding: 2rem; max-width: 420px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
  .header { display: flex; align-items: center; gap: 10px; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid ${color}; }
  .header h1 { font-size: 1.2rem; color: ${color}; }
  .amount { font-size: 2.5rem; font-weight: 700; text-align: center; margin: 1.5rem 0; color: #1a1a1a; }
  .amount span { font-size: 1rem; color: #666; }
  .detail { display: flex; justify-content: space-between; padding: 0.5rem 0; font-size: 0.9rem; color: #555; border-bottom: 1px solid #eee; }
  .detail:last-child { border-bottom: none; }
  .btn-pay { display: block; width: 100%; padding: 1rem; background: ${color}; color: white; border: none; border-radius: 12px; font-size: 1.1rem; font-weight: 600; cursor: pointer; margin-top: 1.5rem; transition: opacity 0.2s; }
  .btn-pay:hover { opacity: 0.9; }
  .btn-pay:disabled { opacity: 0.5; cursor: not-allowed; }
  .success { text-align: center; padding: 1rem; background: #e8f5e9; border-radius: 12px; margin-top: 1rem; color: #2e7d32; display: none; }
  .error { text-align: center; padding: 1rem; background: #ffebee; border-radius: 12px; margin-top: 1rem; color: #c62828; display: none; }
  .footer { text-align: center; margin-top: 1.5rem; font-size: 0.75rem; color: #999; }
  .badge { display: inline-block; background: #fff3e0; color: #e65100; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div>
      <h1>${company}</h1>
      <span class="badge">🧪 Pago Simulado</span>
    </div>
  </div>

  <div class="amount">$${payment.amount.toLocaleString()} <span>COP</span></div>

  <div class="detail"><span>Referencia</span><span>${payment.id.slice(0, 12)}...</span></div>
  <div class="detail"><span>Gateway</span><span>Mock Wompi</span></div>
  <div class="detail"><span>Estado</span><span id="statusDisplay">⏳ Pendiente</span></div>

  <button class="btn-pay" id="payBtn" ${payment.status === "paid" ? "disabled" : ""}>
    ${payment.status === "paid" ? "✅ Ya pagado" : "💳 Pagar ahora"}
  </button>

  <div class="success" id="successMsg">
    ✅ ¡Pago exitoso! El deal se ha cerrado.
    <br><small>Puedes cerrar esta ventana.</small>
  </div>
  <div class="error" id="errorMsg">
    ❌ Error al procesar el pago
  </div>

  <div class="footer">CRM Conversacional · Pasarela de prueba</div>
</div>

<script>
document.getElementById('payBtn').addEventListener('click', async () => {
  const btn = document.getElementById('payBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Procesando...';

  try {
    const res = await fetch('/api/payments/mock-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: '${payment.id}', dealId: '${payment.dealId || ""}' }),
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('successMsg').style.display = 'block';
      document.getElementById('statusDisplay').textContent = '✅ Pagado';
      btn.textContent = '✅ Pagado';
    } else {
      document.getElementById('errorMsg').style.display = 'block';
      document.getElementById('errorMsg').textContent = '❌ ' + (data.error || 'Error');
      btn.disabled = false;
      btn.textContent = '💳 Intentar de nuevo';
    }
  } catch(e) {
    document.getElementById('errorMsg').style.display = 'block';
    btn.disabled = false;
    btn.textContent = '💳 Intentar de nuevo';
  }
});
</script>
</body>
</html>`);
});

// ── Mock Payment Complete (API) ──
app.post("/api/payments/mock-complete", async (req, res) => {
  const { paymentId, dealId } = req.body || {};
  if (!paymentId) return res.status(400).json({ success: false, error: "paymentId requerido" });

  // Buscar en todos los tenants + default
  const { PaymentStore } = await import("./stores/payment-store.mjs");
  const { DealStore } = await import("./stores/deal-store.mjs");
  const { TenantStore } = await import("./stores/tenant-store.mjs");

  const tenantStore = TenantStore.getInstance();
  const tenants = await tenantStore.listActive();
  let payment = null;
  let tenantSlug = null;

  for (const t of tenants) {
    const ps = new PaymentStore(t.slug);
    const all = await ps.getAll();
    payment = all.find(p => p.id === paymentId);
    if (payment) { tenantSlug = t.slug; break; }
  }

  if (!payment) {
    const ps = new PaymentStore(null);
    const all = await ps.getAll();
    payment = all.find(p => p.id === paymentId);
  }

  if (!payment) {
    return res.status(404).json({ success: false, error: "Pago no encontrado" });
  }

  const slug = tenantSlug;
  const ps = new PaymentStore(slug);
  await ps.updateStatus(paymentId, "paid");

  // Actualizar deal a closed_won si hay dealId
  const targetDealId = dealId || payment.dealId;
  if (targetDealId) {
    const ds = new DealStore(slug);
    const deal = await ds.updateStage(targetDealId, "closed_won");
    console.log(`💰 Deal ${targetDealId.slice(0, 8)}... → closed_won ($${deal?.value?.toLocaleString()})`);
  }

  res.json({ success: true, paymentId, status: "paid" });
});

// ── Tenant stats API ──
app.get("/api/tenants", async (req, res) => {
  const { TenantStore } = await import("./stores/tenant-store.mjs");
  const ts = TenantStore.getInstance();
  const tenants = await ts.listActive();
  res.json({ tenants });
});

// ── Transcripción de audio (proxy a Whisper API) ──
app.post("/api/transcribe-audio", async (req, res) => {
  try {
    const { audio, mimeType } = req.body || {};
    if (!audio) {
      return res.status(400).json({ error: "audio (base64) requerido" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY no configurada en el servidor" });
    }

    const buffer = Buffer.from(audio, "base64");
    if (buffer.length === 0) {
      return res.status(400).json({ error: "audio vacío" });
    }

    console.log(`  🎤 Proxy transcribe: ${(buffer.length / 1024).toFixed(1)} KB`);

    const blob = new Blob([buffer], { type: mimeType || "audio/ogg; codecs=opus" });
    const formData = new FormData();
    formData.append("file", blob, "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "es");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text().catch(() => "unknown");
      throw new Error(`Whisper API error ${whisperRes.status}: ${errText.slice(0, 200)}`);
    }

    const data = await whisperRes.json();
    const text = (data.text || "").trim();
    console.log(`  ✅ Proxy transcribe: ${text.length} chars`);
    res.json({ success: true, text });

  } catch (err) {
    console.error(`  ❌ Proxy transcribe error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Discovery endpoint para la tableta WhatsApp ──
// La tableta Termux llama a /api/discover para obtener la URL pública
// del webhook. Estrategia de resolución (en orden):
//   1. CRM_DDNS (DuckDNS) + host-ip.txt — dominio fijo, siempre funciona
//   2. BASE_URL de entorno (seteado por start-tablet)
//   3. tunnel-url.txt (Serveo) — si está activo
//   4. CRM_URL (LAN directa) — fallback
//
// DuckDNS es la solución permanente: el nombre de dominio nunca cambia,
// aunque la IP pública del host cambie, DuckDNS la resuelve actualizada.
app.get("/api/discover", (req, res) => {
  // ── 0. Tunnel URL (Serveo) — prioridad máxima si existe ──
  // El túnel siempre funciona desde cualquier red (no necesita port forwarding).
  // DuckDNS solo si hay port forwarding en el router.
  try {
    const tunnelFile = path.join(__dirname, "data", "tunnel-url.txt");
    if (require("fs").existsSync(tunnelFile)) {
      let tunnelUrl = require("fs").readFileSync(tunnelFile, "utf-8").trim();
      if (tunnelUrl) {
        tunnelUrl = tunnelUrl.replace(/\/+$/, "");
        return res.json({
          success: true,
          webhookUrl: `${tunnelUrl}/api/whatsapp-hook`,
          publicUrl: tunnelUrl,
          method: "tunnel",
          serverTime: new Date().toISOString(),
        });
      }
    }
  } catch {}

  // ── 1. DuckDNS + host-ip.txt (si hay port forwarding) ──
  const CRM_DDNS = process.env.CRM_DDNS || "";
  if (CRM_DDNS) {
    const ddnsBase = CRM_DDNS.replace(/\/+$/, "");
    try {
      const hostIpFile = "/mototractor/host-ip.txt";
      if (require("fs").existsSync(hostIpFile)) {
        const hostIp = require("fs").readFileSync(hostIpFile, "utf-8").trim();
        if (hostIp) {
          return res.json({
            success: true,
            webhookUrl: `${ddnsBase}/api/whatsapp-hook`,
            publicUrl: ddnsBase,
            method: "duckdns",
            serverTime: new Date().toISOString(),
          });
        }
      }
    } catch {}
    return res.json({
      success: true,
      webhookUrl: `${ddnsBase}/api/whatsapp-hook`,
      publicUrl: ddnsBase,
      method: "duckdns",
      serverTime: new Date().toISOString(),
    });
  }
  // ── 2. BASE_URL de entorno (seteado por start-tablet) ──
  let publicUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

  res.json({
    success: true,
    webhookUrl: `${publicUrl}/api/whatsapp-hook`,
    publicUrl,
    method: publicUrl.includes("serveo") ? "tunnel" : "lan",
    serverTime: new Date().toISOString(),
  });
});

// ── Sirve el script wa-tablet.cjs para descargar desde Termux ──
app.get("/api/tablet-script", (req, res) => {
  res.download(path.join(__dirname, "channels", "wa-tablet.cjs"), "wa-tablet.cjs");
});

/**
 * Convierte una tabla HTML a texto plano bien formateado.
 * - Tablas 2-columnas (label|value) → "• Label: Value" con soporte para secciones (colspan)
 * - Tablas multi-columna → formato tabular limpio
 */
function convertTableToText(tableHtml) {
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  function stripCell(html) {
    return html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<strong>(.*?)<\/strong>/gi, "$1")
      .replace(/<b>(.*?)<\/b>/gi, "$1")
      .replace(/<em>(.*?)<\/em>/gi, "$1")
      .replace(/<i>(.*?)<\/i>/gi, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  // Parse rows
  const rows = [];
  let match;
  while ((match = rowRegex.exec(tableHtml)) !== null) {
    const cells = [];
    let cellMatch;
    // Need fresh regex per row
    const rowCellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    while ((cellMatch = rowCellRegex.exec(match[1])) !== null) {
      const isTh = cellMatch[0].startsWith("<th");
      cells.push({ content: stripCell(cellMatch[1]), isHeader: isTh });
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return null;

  // Detectar estilo: ¿todas las filas no-encabezado tienen exactamente 2 columnas?
  const dataRows = rows.filter(r => !r.every(c => c.isHeader));
  const allTwoCol = dataRows.length > 0 && dataRows.every(r => r.length === 2);

  if (allTwoCol) {
    // Formato clave → valor con secciones
    const lines = [];
    for (const row of rows) {
      if (row.length === 1) {
        // Fila de sección (colspan) — usada como título de sección
        const text = row[0].content;
        if (text) lines.push(`\n*${text}*`);
      } else if (row.length === 2) {
        const label = row[0].content.replace(/:$/, "").trim();
        const value = row[1].content.trim();
        if (label && value) {
          lines.push(`-*${label}*: ${value}`);
        }
      }
    }
    return lines.join("\n").trim();
  }

  // Multi-columna: mantener estructura tabular
  const firstRow = rows[0];
  const hasHeader = firstRow.some(c => c.isHeader);
  const bodyRows = hasHeader ? rows.slice(1) : rows;

  if (bodyRows.length === 0) return null;

  const formatted = [];
  if (hasHeader) {
    formatted.push(firstRow.map(c => c.content).join("  ┃  "));
    formatted.push(firstRow.map(() => "—".repeat(12)).join("—┃—"));
  }
  for (const row of bodyRows) {
    formatted.push(row.map(c => c.content).join("  ┃  "));
  }
  return formatted.join("\n");
}

/**
 * stripHtml — Convierte HTML a texto plano legible para WhatsApp/tablet.
 * Maneja tablas correctamente en lugar de dejarlas como pipes rotos.
 */
function stripHtml(str) {
  if (!str) return "";

  // 0. Stripear markdown ANTES de procesar HTML (asteriscos, headers, etc.)
  let result = str
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")  // **bold** → text
    .replace(/\*([^*]+)\*/g, "$1")          // *italic* → text
    .replace(/^#+\s+/gm, "")                // ## headers → text
    .replace(/`{1,3}[^`]*`{1,3}/g, "")      // `code` → remove
    .replace(/~~([\s\S]*?)~~/g, "$1");      // ~~strike~~ → text

  // 1. Extraer y procesar tablas primero (antes de destrozar el HTML)
  const tables = [];
  let tableIndex = 0;
  result = result.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, inner) => {
    const tableText = convertTableToText(`<table>${inner}</table>`);
    const placeholder = `__TABLE_${tableIndex}__`;
    tables.push(tableText || "");
    tableIndex++;
    return placeholder;
  });

  // 2. Manejar etiquetas inline
  result = result
    // <br> → salto de línea
    .replace(/<br\s*\/?>/gi, "\n")
    // <strong>/<b> → solo texto (sin asteriscos)
    .replace(/<strong>(.*?)<\/strong>/gi, "$1")
    .replace(/<b>(.*?)<\/b>/gi, "$1")
    // <i>/<em> → solo texto (sin guiones bajos)
    .replace(/<i>(.*?)<\/i>/gi, "$1")
    .replace(/<em>(.*?)<\/em>/gi, "$1")
    // Eliminar demás etiquetas HTML
    .replace(/<[^>]+>/g, "")
    // Decodificar HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // 3. Restaurar tablas procesadas
  result = result.replace(/__TABLE_(\d+)__/g, (_m, idx) => {
    const t = tables[parseInt(idx)];
    return t ? `\n${t}\n` : "";
  });

  // 4. Limpiar líneas en blanco excesivas
  result = result
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map(l => l.trim())
    .join("\n")
    .trim();

  return result;
}

// ── Tablet Webhook (WhatsApp desde tableta, rate-limited: 30/min por sender) ──
const webhookLimiter = ipRateLimiter({ maxRequests: 60, windowMs: 60 * 1000, message: "Demasiados webhooks. Intenta de nuevo." });
app.post("/api/whatsapp-hook", webhookLimiter, async (req, res) => {
  try {
    const { senderId, senderName, text, tenant, pendingContext } = req.body || {};
    if (!senderId || !text) {
      return res.status(400).json({ error: "senderId y text requeridos" });
    }

    // UNIFICACIÓN: delegar al flujo común de canales (channels/crm-bridge.mjs).
    // El bridge maneja contacto, conversación, dedupe anti-eco (incl. pendingContext),
    // RAG pre-fetch, Agente con timeout, y limpieza HTML/markdown para la tableta.
    // Para `channel: "tablet"` el bridge NO envía por WhatsApp (lo hace la propia
    // tableta leyendo `data.answer` de esta respuesta), devolviendo el texto plano.
    const { processIncomingMessage } = await import("./channels/crm-bridge.mjs");

    const result = await processIncomingMessage({
      channel: "tablet",
      senderId,
      senderName,
      text,
      tenant: tenant || null,
      pendingContext: Array.isArray(pendingContext) ? pendingContext : undefined,
    });

    const finalAnswer = result?.answer || "✅ Recibí tu mensaje. ¿En qué más puedo ayudarte?";
    res.json({ success: true, answer: finalAnswer });
  } catch (err) {
    console.error("❌ whatsapp-hook error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════
//  API REST v1 — Protegida por API Keys
// ══════════════════════════════════════════════════════
{
  const { requireApiKey } = await import("./middleware/api-auth.mjs");
  const { rateLimiter } = await import("./middleware/rate-limiter.mjs");
  const apiRateLimit = rateLimiter();

  // GET /api/v1/stats — estadísticas del tenant
  app.get("/api/v1/stats", requireApiKey, apiRateLimit, async (req, res) => {
    try {
      const stores = (await import("./stores/store-factory.mjs")).StoreFactory.forTenant(req.tenantSlug);
      const contacts = await stores.contacts.getAll();
      const deals = await stores.deals.getAll();
      const conversations = await stores.conversations.getAll();

      res.json({
        success: true,
        tenant: req.tenantSlug || "default",
        stats: {
          contacts: contacts.length,
          deals: deals.length,
          conversations: conversations.length,
          activeConversations: conversations.filter(c => c.status === "active").length,
          dealsByStage: {
            lead: deals.filter(d => d.stage === "lead").length,
            qualified: deals.filter(d => d.stage === "qualified").length,
            proposal: deals.filter(d => d.stage === "proposal").length,
            negotiation: deals.filter(d => d.stage === "negotiation").length,
            closedWon: deals.filter(d => d.stage === "closed_won").length,
            closedLost: deals.filter(d => d.stage === "closed_lost").length,
          },
          totalDealValue: deals.reduce((sum, d) => sum + (d.value || 0), 0),
        },
      });
    } catch (err) {
      console.error("❌ /api/v1/stats error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/v1/contacts — listar contactos
  app.get("/api/v1/contacts", requireApiKey, apiRateLimit, async (req, res) => {
    try {
      const stores = (await import("./stores/store-factory.mjs")).StoreFactory.forTenant(req.tenantSlug);
      const contacts = await stores.contacts.getAll();
      const { search, source, page = 1, limit = 50 } = req.query;

      let filtered = contacts;

      // Filtro opcional: búsqueda textual
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(c =>
          c.name?.toLowerCase().includes(q) ||
          (c.phone || "").includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q)
        );
      }

      // Filtro opcional: por fuente
      if (source) {
        filtered = filtered.filter(c => c.source === source);
      }

      // Paginación
      const total = filtered.length;
      const p = Math.max(1, parseInt(page) || 1);
      const l = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const start = (p - 1) * l;
      const paginated = filtered.slice(start, start + l);

      res.json({
        success: true,
        tenant: req.tenantSlug || "default",
        contacts: paginated.map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          source: c.source,
          company: c.company,
          tags: c.tags,
          conversationCount: c.conversationCount,
          lastActivity: c.lastActivity,
          createdAt: c.createdAt,
        })),
        pagination: {
          total,
          page: p,
          limit: l,
          pages: Math.ceil(total / l),
        },
      });
    } catch (err) {
      console.error("❌ /api/v1/contacts error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/v1/contacts/:id — contacto individual
  app.get("/api/v1/contacts/:id", requireApiKey, apiRateLimit, async (req, res) => {
    try {
      const stores = (await import("./stores/store-factory.mjs")).StoreFactory.forTenant(req.tenantSlug);
      const contact = await stores.contacts.get(req.params.id);
      if (!contact) {
        return res.status(404).json({ success: false, error: "Contacto no encontrado" });
      }
      res.json({ success: true, tenant: req.tenantSlug || "default", contact });
    } catch (err) {
      console.error("❌ /api/v1/contacts/:id error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/v1/deals — listar deals
  app.get("/api/v1/deals", requireApiKey, apiRateLimit, async (req, res) => {
    try {
      const stores = (await import("./stores/store-factory.mjs")).StoreFactory.forTenant(req.tenantSlug);
      const deals = await stores.deals.getAll();
      const { stage, page = 1, limit = 50 } = req.query;

      let filtered = deals;
      if (stage) {
        filtered = filtered.filter(d => d.stage === stage);
      }

      const total = filtered.length;
      const p = Math.max(1, parseInt(page) || 1);
      const l = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const start = (p - 1) * l;

      res.json({
        success: true,
        tenant: req.tenantSlug || "default",
        deals: filtered.slice(start, start + l).map(d => ({
          id: d.id,
          contactId: d.contactId,
          title: d.title,
          value: d.value,
          stage: d.stage,
          source: d.source,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        pagination: {
          total,
          page: p,
          limit: l,
          pages: Math.ceil(total / l),
        },
      });
    } catch (err) {
      console.error("❌ /api/v1/deals error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/v1/conversations — listar conversaciones activas
  app.get("/api/v1/conversations", requireApiKey, apiRateLimit, async (req, res) => {
    try {
      const stores = (await import("./stores/store-factory.mjs")).StoreFactory.forTenant(req.tenantSlug);
      const conversations = await stores.conversations.getAll();
      const { status, contactId, page = 1, limit = 50 } = req.query;

      let filtered = conversations;
      if (status) filtered = filtered.filter(c => c.status === status);
      if (contactId) filtered = filtered.filter(c => c.contactId === contactId);

      const total = filtered.length;
      const p = Math.max(1, parseInt(page) || 1);
      const l = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const start = (p - 1) * l;

      res.json({
        success: true,
        tenant: req.tenantSlug || "default",
        conversations: filtered.slice(start, start + l).map(c => ({
          id: c.id,
          contactId: c.contactId,
          channel: c.channel,
          status: c.status,
          assignedTo: c.assignedTo,
          messageCount: (c.messages || []).length,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        pagination: {
          total,
          page: p,
          limit: l,
          pages: Math.ceil(total / l),
        },
      });
    } catch (err) {
      console.error("❌ /api/v1/conversations error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// ── Web Chat (siempre activo) ──
{
  const { registerWebChat, onWebChatMessage } = await import(
    "./channels/webchat-channel.mjs"
  );
  const { processIncomingMessage } = await import("./channels/crm-bridge.mjs");

  registerWebChat(app, ipRateLimiter({ maxRequests: 20, windowMs: 60 * 1000, message: "Demasiados mensajes. Espera un momento." }));
  onWebChatMessage(processIncomingMessage);
  console.log("  💬 Web Chat:           http://0.0.0.0:" + PORT + "/chat");
  console.log("  🏪 Mock Checkout:      http://0.0.0.0:" + PORT + "/mock-checkout/:paymentId");
}

// ══════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════

const HOST = process.env.CRM_HOST || "0.0.0.0";
const server = app.listen(PORT, HOST, () => {
  console.log("\n═══════════════════════════════════════════");
  console.log("   🏗️  CRM CONVERSACIONAL — SERVER");
  console.log("   🤖 LangChain + DeepSeek + Canales");
  console.log("═══════════════════════════════════════════\n");
  console.log(`  🌐 http://0.0.0.0:${PORT}`);
  console.log(`  🏠 Landing:        http://0.0.0.0:${PORT}/  ← selector de tenants`);
  console.log(`  💬 Web Chat:       http://0.0.0.0:${PORT}/chat`);
  console.log(`  📱 WhatsApp QR:   http://0.0.0.0:${PORT}/whatsapp`);
  console.log(`  📟 Tablet Webhook: POST http://0.0.0.0:${PORT}/api/whatsapp-hook`);
});

// ── Graceful Shutdown ──
async function shutdown(signal) {
  console.log(`\n⚠️  Recibida señal ${signal}. Iniciando shutdown graceful...`);
  server.close(() => console.log("  ✓ HTTP server cerrado"));

  // Flush DB
  try {
    const { flushDb } = await import("./stores/db.mjs");
    flushDb();
    console.log("  ✓ Base de datos flusheada");
  } catch (e) { console.warn("  ⚠️ DB flush error:", e.message); }

  // Timeout forzado
  setTimeout(() => {
    console.log("  ⏱ Timeout de shutdown. Forzando exit.");
    process.exit(0);
  }, 10000).unref();

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── WhatsApp ──
if (!NO_WHATSAPP) {
  const { startWhatsApp, onWhatsAppMessage } = await import(
    "./channels/whatsapp-channel.mjs"
  );
  const { processIncomingMessage } = await import("./channels/crm-bridge.mjs");

  onWhatsAppMessage(processIncomingMessage);

  if (WHATSAPP_PHONE) {
    console.log(`  📱 WhatsApp pairing:    número ${WHATSAPP_PHONE}`);
    startWhatsApp(WHATSAPP_PHONE).catch(err => console.error("❌ WhatsApp fatal:", err.message));
  } else {
    console.log("  📱 WhatsApp:            esperando número — pasa el teléfono como argumento: node crm-server.mjs 573106743561");
  }
} else {
  console.log("  📱 WhatsApp: desactivado");
}

// ── Input loop (solo si es TTY) ──
console.log("\nComandos: status, stats, contacts, deals, q\n");

// ── Keepalive: evita que Node salga cuando no hay TTY ──
if (!process.stdin.isTTY) {
  setInterval(() => {
    // GC manual si --expose-gc está activo
    if (typeof global.gc === "function") {
      global.gc();
    }
  }, 60000);
}

if (process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "CRM> " });
  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim().toLowerCase();
    if (!input || input === "status") {
      const { getWhatsAppStatus } = await import("./channels/whatsapp-channel.mjs");
      const wa = getWhatsAppStatus();
      console.log(`  📱 WhatsApp:  ${NO_WHATSAPP ? "⚪ off" : wa.connected ? "🟢 " + (wa.user?.name || "conectado") : wa.hasQR ? "🟡 QR listo → /whatsapp" : "🟡 iniciando..."}`);
      console.log(`  📸 Instagram: ${NO_INSTAGRAM ? "⚪ off" : "🟡 esperando webhook"}`);
      console.log(`  🌐 http://localhost:${PORT}`);
    } else if (input === "stats") {
      const res = await fetch(`http://localhost:${PORT}/api/stats`);
      console.log(JSON.stringify(await res.json(), null, 2));
    } else if (input === "contacts" || input === "contactos") {
      const { ContactStore } = await import("./stores/contact-store.mjs");
      const contacts = await ContactStore.getInstance().getAll();
      for (const c of contacts) {
        console.log(`  👤 ${c.name.padEnd(20)} ${(c.phone || "").padEnd(15)} ${c.source.padEnd(12)} [${(c.tags||[]).join(", ")}]`);
      }
      if (!contacts.length) console.log("  (sin contactos)");
    } else if (input === "deals") {
      const { DealStore } = await import("./stores/deal-store.mjs");
      const deals = await DealStore.getInstance().getAll();
      for (const d of deals) {
        console.log(`  💰 ${d.title.padEnd(40)} $${String(d.value).padEnd(8)} ${d.stage}`);
      }
      if (!deals.length) console.log("  (sin deals)");
    } else if (input === "q" || input === "quit" || input === "exit") {
      console.log("👋 Bye!");
      server.close();
      process.exit(0);
    }
    rl.prompt();
  });
}
