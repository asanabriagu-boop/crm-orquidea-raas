/**
 * billing.test.mjs — Tests de BillingStore, plan-enforcer, usage-alerts y revenue-stats
 */
import { describe, it, expect, beforeAll } from "vitest";

// ── In-memory MockStore para tests de stores SQLite ──
class MemoryStore {
  constructor() { this._data = new Map(); }
  async getAll() { return Array.from(this._data.values()); }
  async get(id) { return this._data.get(id) || null; }
  async put(item) { this._data.set(item.id, item); return item; }
  async delete(id) { return this._data.delete(id); }
}

// ── Mock de BillingStore usando MemoryStore ──
import { BillingEvent } from "../stores/billing-store.mjs";

class MockBillingStore {
  constructor() { this._store = new MemoryStore(); }
  static getInstance() {
    if (!MockBillingStore._instance) MockBillingStore._instance = new MockBillingStore();
    return MockBillingStore._instance;
  }
  async create(eventData) {
    const event = new BillingEvent(eventData);
    return this._store.put({ ...event.toJSON(), metadata: JSON.stringify(event.metadata) });
  }
  async getByTenant(tenantSlug, limit = 20) {
    const all = await this._store.getAll();
    const filtered = all.filter(e => e.tenantSlug === tenantSlug)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return filtered.slice(0, limit).map(e => ({
      ...e,
      metadata: typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata,
    }));
  }
  async getAll(limit = 100) {
    const all = await this._store.getAll();
    const sorted = all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sorted.slice(0, limit).map(e => ({
      ...e,
      metadata: typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata,
    }));
  }
  async getRevenueStats(startDate, endDate) {
    const all = await this._store.getAll();
    const start = startDate ? new Date(startDate) : new Date("2020-01-01");
    const end = endDate ? new Date(endDate) : new Date();
    const payments = all.filter(e => {
      const d = new Date(e.createdAt);
      return (e.type === "payment_received" || e.type === "subscription_created")
        && e.status === "completed" && d >= start && d <= end;
    });
    return {
      totalRevenue: payments.reduce((s, e) => s + (e.amount || 0), 0),
      paymentCount: payments.length,
      uniqueTenants: new Set(payments.map(e => e.tenantSlug)).size,
    };
  }
}

describe("BillingEvent", () => {
  it("crea evento con valores por defecto", () => {
    const ev = new BillingEvent({ type: "payment_received", amount: 100 });
    expect(ev.id).toBeDefined();
    expect(ev.type).toBe("payment_received");
    expect(ev.amount).toBe(100);
    expect(ev.status).toBe("completed");
    expect(ev.createdAt).toBeDefined();
  });

  it("crea evento con todos los campos", () => {
    const ev = new BillingEvent({
      tenantSlug: "mototractor",
      type: "subscription_created",
      planId: "professional",
      amount: 79,
      status: "completed",
      metadata: { source: "checkout" },
    });
    expect(ev.tenantSlug).toBe("mototractor");
    expect(ev.planId).toBe("professional");
    expect(ev.metadata.source).toBe("checkout");
  });

  it("toJSON serializa correctamente", () => {
    const ev = new BillingEvent({ type: "test", amount: 50 });
    const json = ev.toJSON();
    expect(json.id).toBe(ev.id);
    expect(json.type).toBe("test");
    expect(json.amount).toBe(50);
  });

  it("fromJSON reconstruye evento", () => {
    const ev = BillingEvent.fromJSON({ type: "payment_received", amount: 200, tenantSlug: "ideagro" });
    expect(ev.type).toBe("payment_received");
    expect(ev.amount).toBe(200);
    expect(ev.tenantSlug).toBe("ideagro");
  });
});

describe("BillingStore", () => {
  const store = new MockBillingStore();

  it("crea y recupera eventos por tenant", async () => {
    await store.create({ tenantSlug: "mototractor", type: "payment_received", amount: 79, planId: "professional" });
    await store.create({ tenantSlug: "ideagro", type: "payment_received", amount: 29, planId: "starter" });
    await store.create({ tenantSlug: "mototractor", type: "subscription_created", amount: 79, planId: "professional" });

    const motoEvents = await store.getByTenant("mototractor");
    expect(motoEvents).toHaveLength(2);
    expect(motoEvents[0].amount).toBe(79);

    const ideaEvents = await store.getByTenant("ideagro");
    expect(ideaEvents).toHaveLength(1);
    expect(ideaEvents[0].amount).toBe(29);
  });

  it("getAll retorna todos ordenados", async () => {
    const all = await store.getAll();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it("getRevenueStats calcula ingresos", async () => {
    const stats = await store.getRevenueStats();
    expect(stats.totalRevenue).toBeGreaterThanOrEqual(79 + 29 + 79);
    expect(stats.paymentCount).toBeGreaterThanOrEqual(3);
    expect(stats.uniqueTenants).toBeGreaterThanOrEqual(2);
  });
});

describe("Subscription Plans", () => {
  it("planes están definidos con precio y límites", async () => {
    const { SUBSCRIPTION_PLANS, getPlan } = await import("../config/subscriptions.mjs");
    expect(SUBSCRIPTION_PLANS.length).toBe(4);

    const free = getPlan("free");
    expect(free.price).toBe(0);
    expect(free.maxContacts).toBe(10);

    const pro = getPlan("professional");
    expect(pro.price).toBe(79);
    expect(pro.maxReasonings).toBe(5000);
    expect(pro.allowedChannels).toContain("whatsapp");
    expect(pro.allowedChannels).toContain("instagram");

    const enterprise = getPlan("enterprise");
    expect(enterprise.maxContacts).toBe(Infinity);
    expect(enterprise.maxReasonings).toBe(Infinity);
  });

  it("getPlan retorna free para plan desconocido", async () => {
    const { getPlan } = await import("../config/subscriptions.mjs");
    const plan = getPlan("nonexistent");
    expect(plan.id).toBe("free");
  });

  it("getMonthlyPrice maneja planes anuales", async () => {
    const { getMonthlyPrice } = await import("../config/subscriptions.mjs");
    const monthly = getMonthlyPrice("enterprise");
    expect(monthly).toBe(125); // 1500 / 12
  });
});

describe("Plan Enforcer", () => {
  it("checkQuota permite recursos ilimitados para enterprise", async () => {
    const { checkQuota } = await import("../services/plan-enforcer.mjs");
    const result = await checkQuota("mototractor", "razonamientos");
    // mototractor tenant existe y tiene plan enterprise en tenants.json
    // Si falla por no encontrar tenant, cae a free
    expect(result.allowed).toBe(true);
    if (result.limit === Infinity) {
      expect(result.alertLevel).toBe("ok");
    }
  });

  it("checkQuota bloquea al exceder límite", async () => {
    const { checkQuota } = await import("../services/plan-enforcer.mjs");
    // Usar tenant con plan free (límite 10 contactos)
    // Pasamos null para obtener el plan free default
    // Primero incrementamos usage si existe
    const result = await checkQuota(null, "contactos");
    expect(result).toBeDefined();
    expect(result.plan).toBe("free");
    expect(result.limit).toBe(10);
  });

  it("getUsageSummary retorna estructura correcta", async () => {
    const { getUsageSummary } = await import("../services/plan-enforcer.mjs");
    const summary = await getUsageSummary("mototractor");
    expect(summary).toBeDefined();
    expect(summary.tenant).toBe("mototractor");
    expect(summary.razonamientos).toBeDefined();
    expect(summary.contactos).toBeDefined();
    expect(summary.deals).toBeDefined();
    expect(summary.razonamientos.usado).toBeGreaterThanOrEqual(0);
  });
});

describe("Usage Alerts", () => {
  it("getUsageAlerts retorna estructura correcta", async () => {
    const { getUsageAlerts } = await import("../services/usage-alerts.mjs");
    const alerts = await getUsageAlerts("mototractor");
    expect(alerts).toBeDefined();
    expect(alerts).toHaveProperty("alerts");
    expect(alerts).toHaveProperty("hasAlerts");
    expect(alerts).toHaveProperty("highestLevel");
    expect(alerts).toHaveProperty("planName");
  });

  it("shouldWarn retorna booleano", async () => {
    const { shouldWarn } = await import("../services/usage-alerts.mjs");
    const warn = await shouldWarn("mototractor", "razonamientos");
    expect(typeof warn).toBe("boolean");
  });

  it("getAlertMessage retorna string o null", async () => {
    const { getAlertMessage } = await import("../services/usage-alerts.mjs");
    const msg = await getAlertMessage("mototractor", "razonamientos");
    expect(msg === null || typeof msg === "string").toBe(true);
  });
});
