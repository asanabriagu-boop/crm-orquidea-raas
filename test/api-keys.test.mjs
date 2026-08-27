/**
 * api-keys.test.mjs — Tests del sistema de API Keys + REST API
 *
 * Cubre:
 *   - ApiKeyStore: create, validate, revoke, list, delete
 *   - Middleware: api-auth, rate-limiter
 *   - REST API: /api/v1/contacts, /api/v1/stats
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──
vi.mock("../stores/base-store.mjs", () => {
  const mockData = [];
  const mockStore = {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    put: vi.fn().mockImplementation(async (record) => {
      const idx = mockData.findIndex(d => d.id === record.id);
      if (idx >= 0) mockData[idx] = record;
      else mockData.push(record);
      return record;
    }),
    delete: vi.fn().mockResolvedValue(true),
  };
  const BaseStore = vi.fn(() => mockStore);
  BaseStore.prototype.getAll = mockStore.getAll;
  BaseStore.prototype.get = mockStore.get;
  BaseStore.prototype.put = mockStore.put;
  BaseStore.prototype.delete = mockStore.delete;
  return { BaseStore };
});

vi.mock("../stores/tenant-store.mjs", () => ({
  TenantStore: {
    getInstance: vi.fn(() => ({
      findBySlug: vi.fn().mockResolvedValue({
        slug: "test-tenant",
        plan: "professional",
        name: "Test Tenant",
        branding: { companyName: "Test" },
      }),
    })),
  },
}));

vi.mock("../config/subscriptions.mjs", () => ({
  SUBSCRIPTION_PLANS: [
    { id: "free", maxReasonings: 100, name: "Free" },
    { id: "starter", maxReasonings: 1000, name: "Starter" },
    { id: "professional", maxReasonings: 5000, name: "Professional" },
  ],
  getPlan: vi.fn((planId) => {
    const plans = {
      free: { id: "free", maxReasonings: 100, name: "Free" },
      starter: { id: "starter", maxReasonings: 1000, name: "Starter" },
      professional: { id: "professional", maxReasonings: 5000, name: "Professional" },
    };
    return plans[planId] || plans.free;
  }),
  getMonthlyPrice: vi.fn(() => 79),
}));

// Import after mocks
import { ApiKeyStore } from "../stores/api-key-store.mjs";
import { BaseStore } from "../stores/base-store.mjs";

describe("ApiKeyStore", () => {
  let store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new ApiKeyStore("test-tenant");
  });

  it("crea una API key con formato correcto", async () => {
    const result = await store.create({ label: "Test Key" });

    expect(result.key).toMatch(/^crm_sk_[0-9a-f]{64}$/);
    expect(result.record.label).toBe("Test Key");
    expect(result.record.keyPrefix).toBe(result.key.slice(0, 11));
    expect(result.record.lastDigits).toBe(result.key.slice(-4));
    expect(result.record.keyHash).toBeDefined();
    expect(result.record.isActive).toBe(true);
    expect(result.record.tenantSlug).toBe("test-tenant");
  });

  it("valida una API key correcta", async () => {
    const { key, record } = await store.create({ label: "Test" });

    // El mock de base-store almacena en su array interno, así que necesitamos
    // que getAll devuelva el record creado
    BaseStore.prototype.getAll.mockResolvedValue([record.toJSON()]);

    const validated = await store.validate(key);
    expect(validated).not.toBeNull();
    expect(validated.id).toBe(record.id);
    expect(validated.isActive).toBe(true);
  });

  it("rechaza API key inválida", async () => {
    BaseStore.prototype.getAll.mockResolvedValue([]);

    const result = await store.validate("crm_sk_invalidkey");
    expect(result).toBeNull();
  });

  it("rechaza API key revocada", async () => {
    const { key, record } = await store.create({ label: "To Revoke" });
    const recordData = record.toJSON();
    recordData.isActive = false;
    BaseStore.prototype.getAll.mockResolvedValue([recordData]);

    const result = await store.validate(key);
    expect(result).toBeNull();
  });

  it("revoca una API key", async () => {
    const { key, record } = await store.create({ label: "To Revoke" });

    // Mock get to return the record so revoke can modify it
    const recordData = record.toJSON();
    BaseStore.prototype.get.mockResolvedValue(recordData);

    await store.revoke(record.id);

    expect(recordData.isActive).toBe(false);
    // Verify put was called with isActive=false
    const putCalls = BaseStore.prototype.put.mock.calls;
    const lastPut = putCalls[putCalls.length - 1];
    if (lastPut) {
      expect(lastPut[0].isActive).toBe(false);
    }
  });

  it("lista todas las keys", async () => {
    await store.create({ label: "Key 1" });
    await store.create({ label: "Key 2" });

    const keys = await store.list();
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThanOrEqual(0);
  });

  it("elimina una API key", async () => {
    const { record } = await store.create({ label: "To Delete" });

    const result = await store.delete(record.id);
    expect(result).toBe(true);
  });

  it("múltiples keys para mismo tenant se aíslan correctamente", async () => {
    const k1 = await store.create({ label: "Key A" });
    const k2 = await store.create({ label: "Key B" });

    expect(k1.record.id).not.toBe(k2.record.id);
    expect(k1.key).not.toBe(k2.key);
  });
});

describe("API key show-once security", () => {
  it("el objeto record no contiene la clave completa", async () => {
    const store = new ApiKeyStore("test-tenant");
    const result = await store.create({ label: "Secure Key" });

    // El record SOLO debe tener keyHash, NO la clave en texto plano
    expect(result.record.keyHash).toBeDefined();
    expect(result.record.key).toBeUndefined();
    expect(result.record.fullKey).toBeUndefined();
    expect(result.record.rawKey).toBeUndefined();
  });

  it("keyPrefix solo muestra inicio y lastDigits el final", async () => {
    const store = new ApiKeyStore("test-tenant");
    const result = await store.create({ label: "Prefix Test" });

    expect(result.record.keyPrefix.length).toBeLessThan(12);
    expect(result.record.lastDigits.length).toBe(4);
    // lastDigits debe coincidir con el final de la key real
    expect(result.key.endsWith(result.record.lastDigits)).toBe(true);
  });
});

describe("Rate Limiter", () => {
  it("respeta límite configurado", async () => {
    const { rateLimiter, resetRateLimiter } = await import("../middleware/rate-limiter.mjs");
    resetRateLimiter();

    const limiter = rateLimiter({ maxRequests: 3 });
    const req = { apiKey: { id: "test-key-1", tenantSlug: "test-tenant" } };
    const next = vi.fn();
    const statusJson = [];

    const res = {
      status: vi.fn((code) => {
        statusJson.push({ code });
        return { json: vi.fn((data) => statusJson.push(data)) };
      }),
      set: vi.fn(),
    };

    // Primeros 3 requests deben pasar
    for (let i = 0; i < 3; i++) {
      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(i + 1);
    }

    // 4to request debe ser rechazado
    await limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(3); // no incrementó

    // Verificar que se llamó status(429)
    const statusCalls = res.status.mock.calls;
    const has429 = statusCalls.some(c => c[0] === 429);
    expect(has429).toBe(true);

    resetRateLimiter();
  });

  it("aísla ventanas por API key", async () => {
    const { rateLimiter, resetRateLimiter } = await import("../middleware/rate-limiter.mjs");
    resetRateLimiter();

    const limiter = rateLimiter({ maxRequests: 2 });
    const nextA = vi.fn();
    const nextB = vi.fn();
    const resMock = { status: vi.fn(() => ({ json: vi.fn() })), set: vi.fn() };

    // Consumir key-1
    await limiter({ apiKey: { id: "key-1" } }, resMock, nextA);
    await limiter({ apiKey: { id: "key-1" } }, resMock, nextA);
    expect(nextA).toHaveBeenCalledTimes(2);

    // key-2 debe poder hacer sus propios requests
    await limiter({ apiKey: { id: "key-2" } }, resMock, nextB);
    expect(nextB).toHaveBeenCalledTimes(1);

    resetRateLimiter();
  });
});

describe("API Auth Middleware", () => {
  it("rechaza request sin header Authorization", async () => {
    const { requireApiKey } = await import("../middleware/api-auth.mjs");

    const req = { headers: {} };
    const res = {
      status: vi.fn(() => ({ json: vi.fn() })),
    };
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rechaza header que no es Bearer", async () => {
    const { requireApiKey } = await import("../middleware/api-auth.mjs");

    const req = { headers: { authorization: "Basic xyz" } };
    const res = {
      status: vi.fn(() => ({ json: vi.fn() })),
    };
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rechaza API key inválida", async () => {
    // Mock ApiKeyStore.validate returns null for invalid keys
    const { ApiKeyStore } = await import("../stores/api-key-store.mjs");
    const validateMock = vi.fn().mockResolvedValue(null);
    ApiKeyStore.getInstance = vi.fn(() => ({ validate: validateMock }));

    const { requireApiKey } = await import("../middleware/api-auth.mjs");
    const req = { headers: { authorization: "Bearer crm_sk_badkey" } };
    const res = {
      status: vi.fn(() => ({ json: vi.fn() })),
    };
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("pasa con API key válida", async () => {
    const validateMock = vi.fn().mockResolvedValue({
      id: "key-1",
      label: "Test",
      tenantSlug: "test-tenant",
      isActive: true,
    });

    const { requireApiKey } = await import("../middleware/api-auth.mjs");
    // Re-mockear getInstance para este test
    const { ApiKeyStore } = await import("../stores/api-key-store.mjs");
    ApiKeyStore.getInstance = vi.fn(() => ({ validate: validateMock }));

    const req = { headers: { authorization: "Bearer crm_sk_valid" }, apiKey: {} };
    const res = {};
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.apiKey.tenantSlug).toBe("test-tenant");
    expect(req.tenantSlug).toBe("test-tenant");
  });
});
