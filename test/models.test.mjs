/**
 * models.test.mjs — Tests de modelos del CRM
 */
import { describe, it, expect } from "vitest";
import { Contact, Deal, Conversation, Pipeline, Tenant, Product, Cart, Payment } from "../models.mjs";

describe("Contact", () => {
  it("crea contacto con valores por defecto", () => {
    const c = new Contact({});
    expect(c.id).toBeDefined();
    expect(c.name).toBe("");
    expect(c.phone).toBe("");
    expect(c.email).toBe("");
    expect(c.source).toBe("manual");
    expect(c.notes).toEqual([]);
    expect(c.tags).toEqual([]);
    expect(c.conversationCount).toBe(0);
  });

  it("crea contacto con datos completos", () => {
    const c = new Contact({
      name: "Carlos",
      phone: "573001234567",
      email: "carlos@test.com",
      source: "whatsapp",
      company: "TestCorp",
      tags: ["vip"],
    });
    expect(c.name).toBe("Carlos");
    expect(c.phone).toBe("573001234567");
    expect(c.source).toBe("whatsapp");
    expect(c.tags).toContain("vip");
  });

  it("serializa y deserializa correctamente", () => {
    const original = new Contact({ name: "Test", phone: "123" });
    const json = original.toJSON();
    const restored = Contact.fromJSON(json);
    expect(restored.name).toBe("Test");
    expect(restored.phone).toBe("123");
    expect(restored.source).toBe("manual");
  });
});

describe("Deal", () => {
  it("crea deal con etapa lead por defecto", () => {
    const d = new Deal({ contactId: "c1", title: "Deal Test" });
    expect(d.stage).toBe("lead");
    expect(d.value).toBe(0);
    expect(d.source).toBe("manual");
  });

  it("serializa correctamente", () => {
    const d = new Deal({ contactId: "c1", title: "Venta", value: 500000, stage: "qualified" });
    const json = d.toJSON();
    expect(json.title).toBe("Venta");
    expect(json.value).toBe(500000);
    expect(json.stage).toBe("qualified");
  });
});

describe("Conversation", () => {
  it("crea conversación activa con assignedTo ai", () => {
    const c = new Conversation({ contactId: "c1" });
    expect(c.channel).toBe("webchat");
    expect(c.status).toBe("active");
    expect(c.assignedTo).toBe("ai");
    expect(c.messages).toEqual([]);
  });

  it("addMessage agrega mensaje con timestamp", () => {
    const c = new Conversation({ contactId: "c1" });
    c.addMessage("customer", "Hola");
    expect(c.messages).toHaveLength(1);
    expect(c.messages[0].role).toBe("customer");
    expect(c.messages[0].content).toBe("Hola");
    expect(c.messages[0].timestamp).toBeDefined();
  });
});

describe("Pipeline", () => {
  it("crea pipeline con 6 etapas por defecto", () => {
    const p = new Pipeline({});
    expect(p.stages).toHaveLength(6);
    expect(p.stages[0]).toBe("lead");
    expect(p.stages[4]).toBe("closed_won");
  });
});

describe("Tenant", () => {
  it("crea tenant con valores por defecto", () => {
    const t = new Tenant({ name: "Test", slug: "test" });
    expect(t.plan).toBe("free");
    expect(t.isActive).toBe(true);
    expect(t.branding.primaryColor).toBe("#2d5016");
  });
});

describe("Product", () => {
  it("crea producto con precio 0 por defecto", () => {
    const p = new Product({ name: "Mototractor" });
    expect(p.price).toBe(0);
    expect(p.isActive).toBe(true);
  });
});

describe("Cart", () => {
  it("calcula total desde items", () => {
    const c = new Cart({
      contactId: "c1",
      items: [
        { productId: "p1", name: "Item 1", unitPrice: 100, quantity: 2 },
        { productId: "p2", name: "Item 2", unitPrice: 50, quantity: 3 },
      ],
    });
    expect(c.total).toBe(350);
  });

  it("crea carrito vacío", () => {
    const c = new Cart({ contactId: "c1" });
    expect(c.total).toBe(0);
    expect(c.status).toBe("active");
  });
});

describe("Payment", () => {
  it("crea pago pendiente por defecto", () => {
    const p = new Payment({ dealId: "d1", amount: 100000 });
    expect(p.status).toBe("pending");
    expect(p.gateway).toBe("mock");
  });
});
