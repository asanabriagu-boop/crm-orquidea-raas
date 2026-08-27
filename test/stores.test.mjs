/**
 * stores.test.mjs — Tests de los stores del CRM
 */
import { describe, it, expect } from "vitest";

// Usamos los mocks en memoria para tests rápidos
import { MockContactStore, MockDealStore, MockConversationStore } from "./helpers.mjs";

describe("ContactStore", () => {
  it("crea y recupera contacto", async () => {
    const store = new MockContactStore();
    const c = await store.create({ name: "Test", phone: "573001234567", source: "whatsapp" });
    expect(c.id).toBeDefined();
    expect(c.name).toBe("Test");
    expect(c.phone).toBe("573001234567");
    expect(c.source).toBe("whatsapp");

    const found = await store.findByPhone("573001234567");
    expect(found).toBeDefined();
    expect(found.id).toBe(c.id);
  });

  it("findByPhone retorna null si no existe", async () => {
    const store = new MockContactStore();
    const found = await store.findByPhone("no-existe");
    expect(found).toBeNull();
  });

  it("search busca en nombre, teléfono y email", async () => {
    const store = new MockContactStore();
    await store.create({ name: "Carlos López", phone: "573001234567", email: "carlos@test.com" });
    await store.create({ name: "María García", phone: "573009876543", email: "maria@test.com" });

    const byName = await store.search("carlos");
    expect(byName).toHaveLength(1);

    const byEmail = await store.search("maria");
    expect(byEmail).toHaveLength(1);

    const byPhone = await store.search("9876543");
    expect(byPhone).toHaveLength(1);
  });
});

describe("DealStore", () => {
  it("crea deal con valores por defecto", async () => {
    const store = new MockDealStore();
    const d = await store.create({ contactId: "c1", title: "Deal Test", value: 1000 });
    expect(d.stage).toBe("lead");
    expect(d.source).toBe("manual");
    expect(d.createdAt).toBeDefined();
  });

  it("filtra deals por contacto y etapa", async () => {
    const store = new MockDealStore();
    await store.create({ contactId: "c1", title: "Deal 1", stage: "qualified", value: 500 });
    await store.create({ contactId: "c1", title: "Deal 2", stage: "negotiation", value: 1000 });
    await store.create({ contactId: "c2", title: "Deal 3", stage: "lead", value: 200 });

    const c1Deals = await store.findByContact("c1");
    expect(c1Deals).toHaveLength(2);

    const leadDeals = await store.findByStage("lead");
    expect(leadDeals).toHaveLength(1);
  });

  it("actualiza etapa del deal", async () => {
    const store = new MockDealStore();
    const d = await store.create({ contactId: "c1", title: "Mi Deal", value: 1000 });
    const updated = await store.updateStage(d.id, "closed_won");
    expect(updated.stage).toBe("closed_won");
  });

  it("genera resumen del pipeline", async () => {
    const store = new MockDealStore();
    await store.create({ contactId: "c1", title: "D1", stage: "lead", value: 100 });
    await store.create({ contactId: "c2", title: "D2", stage: "qualified", value: 200 });
    await store.create({ contactId: "c3", title: "D3", stage: "lead", value: 300 });

    const summary = await store.getPipelineSummary();
    expect(summary.totalDeals).toBe(3);
    expect(summary.totalValue).toBe(600);
    expect(summary.stages.lead).toBe(2);
    expect(summary.stages.qualified).toBe(1);
  });
});

describe("ConversationStore", () => {
  it("crea conversación y agrega mensajes", async () => {
    const store = new MockConversationStore();
    const c = await store.create({ contactId: "c1", channel: "whatsapp" });
    expect(c.messages).toHaveLength(0);

    await store.addMessage(c.id, "customer", "Hola");
    await store.addMessage(c.id, "ai", "Hola, ¿en qué puedo ayudarte?");

    const conv = await store.get(c.id);
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[0].role).toBe("customer");
    expect(conv.messages[1].role).toBe("ai");
  });

  it("encuentra conversaciones por contacto ordenadas por updatedAt", async () => {
    const store = new MockConversationStore();
    const c1 = await store.create({ contactId: "c1" });
    const c2 = await store.create({ contactId: "c1" });

    // Actualizar c1 para que tenga updatedAt más reciente
    await store.addMessage(c1.id, "customer", "nuevo msg");
    await new Promise(r => setTimeout(r, 10));
    await store.addMessage(c2.id, "customer", "otro msg");

    const convs = await store.findByContact("c1");
    expect(convs).toHaveLength(2);
    // Más reciente primero
    expect(new Date(convs[0].updatedAt).getTime())
      .toBeGreaterThanOrEqual(new Date(convs[1].updatedAt).getTime());
  });

  it("filtra por estado", async () => {
    const store = new MockConversationStore();
    await store.create({ contactId: "c1", status: "active" });
    await store.create({ contactId: "c2", status: "resolved" });

    const active = await store.findByStatus("active");
    expect(active).toHaveLength(1);
  });

  it("asigna conversación a agente", async () => {
    const store = new MockConversationStore();
    const c = await store.create({ contactId: "c1" });
    const assigned = await store.assignTo(c.id, "humano-1");
    expect(assigned.assignedTo).toBe("humano-1");
  });

  it("genera transcript", async () => {
    const store = new MockConversationStore();
    const c = await store.create({ contactId: "c1" });
    await store.addMessage(c.id, "customer", "Hola");
    await store.addMessage(c.id, "ai", "Hola!");
    const transcript = await store.getTranscript(c.id);
    expect(transcript).toContain("[customer] Hola");
    expect(transcript).toContain("[ai] Hola!");
  });
});
