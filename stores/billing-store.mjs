/**
 * billing-store.mjs — Registro inmutable de eventos de facturación
 *
 * Almacena eventos cross-tenant (subscription_created, payment_received,
 * subscription_changed, usage_alert, etc.) para historial de billing,
 * revenue tracking y dashboards.
 *
 * Persiste en tabla SQLite "billing" (cross-tenant, sin tenant_id).
 */
import { BaseStore } from "./base-store.mjs";
import crypto from "crypto";

const _instances = new Map();

export class BillingEvent {
  constructor({ id, tenantSlug, type, planId, amount, status, metadata } = {}) {
    this.id = id || crypto.randomUUID();
    this.tenantSlug = tenantSlug || "";
    this.type = type || "generic";
    this.planId = planId || "";
    this.amount = amount || 0;
    this.status = status || "completed"; // "completed" | "pending" | "failed"
    this.metadata = metadata || {};
    this.createdAt = new Date().toISOString();
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new BillingEvent(data);
  }
}

export class BillingStore {
  constructor() {
    this._store = new BaseStore("billing");
  }

  static getInstance() {
    if (!_instances.has("__default__")) {
      _instances.set("__default__", new BillingStore());
    }
    return _instances.get("__default__");
  }

  /**
   * Crea un evento de billing.
   */
  async create(eventData) {
    const event = new BillingEvent(eventData);
    // Almacenar con tenantSlug en metadata para filtrado cross-tenant
    const record = {
      ...event.toJSON(),
      metadata: JSON.stringify(event.metadata),
    };
    return this._store.put(record);
  }

  /**
   * Obtiene eventos por tenant, ordenados por fecha descendente.
   */
  async getByTenant(tenantSlug, limit = 20) {
    const all = await this._store.getAll();
    const filtered = all
      .filter(e => e.tenantSlug === tenantSlug)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    // Reconstruir metadata
    return filtered.slice(0, limit).map(e => ({
      ...e,
      metadata: typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata,
    }));
  }

  /**
   * Obtiene todos los eventos (admin).
   */
  async getAll(limit = 100) {
    const all = await this._store.getAll();
    const sorted = all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sorted.slice(0, limit).map(e => ({
      ...e,
      metadata: typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata,
    }));
  }

  /**
   * Obtiene estadísticas de revenue.
   * @param {string} [startDate] - ISO date string
   * @param {string} [endDate] - ISO date string
   */
  async getRevenueStats(startDate, endDate) {
    const all = await this._store.getAll();

    const start = startDate ? new Date(startDate) : new Date("2020-01-01");
    const end = endDate ? new Date(endDate) : new Date();

    // Filtrar eventos de pago en el rango
    const payments = all.filter(e => {
      const d = new Date(e.createdAt);
      return (e.type === "payment_received" || e.type === "subscription_created" || e.type === "subscription_changed")
        && e.status === "completed"
        && d >= start && d <= end;
    });

    const totalRevenue = payments.reduce((sum, e) => sum + (e.amount || 0), 0);
    const paymentCount = payments.length;
    const uniqueTenants = new Set(payments.map(e => e.tenantSlug)).size;

    return {
      totalRevenue,
      paymentCount,
      uniqueTenants,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }
}
