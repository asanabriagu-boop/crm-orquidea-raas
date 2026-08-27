/**
 * deals-scope.test.mjs — Pruebas de privacidad por-scope en las tools de deals.
 *
 * Verifica que listar_deals, resumen_pipeline, obtener_contacto y
 * actualizar_etapa_deal estén restringidos al contacto de la interacción
 * actual (inyectado vía config.configurable.contactId) y que NUNCA expongan
 * deals de otros clientes del mismo tenant.
 */
import { describe, it, expect } from "vitest";
import { createMockStores } from "./helpers.mjs";
import { createCrmTools } from "../tools/crm-tools.mjs";

function toolByName(tools, name) {
  return tools.find(t => t.name === name);
}

function cfg(contactId) {
  return { configurable: { contactId } };
}

const SCOPE_DENIED = "solo puedes consultar tus propios deals";

describe("listar_deals — scope por contacto", () => {
  it("devuelve SOLO los deals del contacto de la interacción (config)", async () => {
    const stores = createMockStores();
    await stores.deals.create({ contactId: "c1", title: "Deal c1 A", value: 100, stage: "lead" });
    await stores.deals.create({ contactId: "c1", title: "Deal c1 B", value: 200, stage: "negotiation" });
    await stores.deals.create({ contactId: "c2", title: "Deal c2", value: 999, stage: "lead" });

    const tool = toolByName(createCrmTools(stores), "listar_deals");
    const out = JSON.parse(await tool.func({ limit: 20 }, undefined, cfg("c1")));

    expect(out.total).toBe(2);
    expect(out.deals.map(d => d.title)).toEqual(["Deal c1 A", "Deal c1 B"]);
    expect(out.error).toBeUndefined();
  });

  it("rechaza si el LLM pasa un contactId distinto al de la interacción", async () => {
    const stores = createMockStores();
    await stores.deals.create({ contactId: "c1", title: "Deal c1", value: 100 });
    await stores.deals.create({ contactId: "c2", title: "Deal c2 secreto", value: 999 });

    const tool = toolByName(createCrmTools(stores), "listar_deals");
    const out = JSON.parse(await tool.func({ contactId: "c2", limit: 20 }, undefined, cfg("c1")));

    expect(out.total).toBe(0);
    expect(out.deals).toHaveLength(0);
    expect(out.error).toContain(SCOPE_DENIED);
  });

  it("NO cae en getAll(): sin config y sin contactId devuelve vacío, no el tenant completo", async () => {
    const stores = createMockStores();
    await stores.deals.create({ contactId: "c1", title: "Deal c1", value: 100 });
    await stores.deals.create({ contactId: "c2", title: "Deal c2", value: 999 });

    const tool = toolByName(createCrmTools(stores), "listar_deals");
    const out = JSON.parse(await tool.func({ limit: 20 }, undefined, undefined));

    expect(out.total).toBe(0);
    expect(out.error).toBeDefined();
  });

  it("al filtrar por stage NO amplía el alcance fuera del contacto", async () => {
    const stores = createMockStores();
    await stores.deals.create({ contactId: "c1", title: "c1 lead", value: 100, stage: "lead" });
    await stores.deals.create({ contactId: "c2", title: "c2 lead", value: 999, stage: "lead" });
    await stores.deals.create({ contactId: "c1", title: "c1 closed", value: 200, stage: "closed_won" });

    const tool = toolByName(createCrmTools(stores), "listar_deals");
    const out = JSON.parse(await tool.func({ stage: "lead", limit: 20 }, undefined, cfg("c1")));

    expect(out.total).toBe(1);
    expect(out.deals[0].title).toBe("c1 lead");
  });
});

describe("resumen_pipeline — scope por contacto", () => {
  it("resume SOLO los deals del contacto, no el pipeline del tenant", async () => {
    const stores = createMockStores();
    await stores.deals.create({ contactId: "c1", title: "c1 lead", value: 100, stage: "lead" });
    await stores.deals.create({ contactId: "c1", title: "c1 qual", value: 200, stage: "qualified" });
    await stores.deals.create({ contactId: "c2", title: "c2 lead", value: 9999, stage: "lead" });

    const tool = toolByName(createCrmTools(stores), "resumen_pipeline");
    const out = JSON.parse(await tool.func({}, undefined, cfg("c1")));

    expect(out.totalDeals).toBe(2);
    expect(out.totalValue).toBe(300);
    expect(out.stages.lead).toBe(1);
    expect(out.stages.qualified).toBe(1);
  });

  it("rechaza si el LLM pasa un contactId distinto", async () => {
    const stores = createMockStores();
    await stores.deals.create({ contactId: "c2", title: "c2", value: 999, stage: "lead" });

    const tool = toolByName(createCrmTools(stores), "resumen_pipeline");
    const out = JSON.parse(await tool.func({ contactId: "c2" }, undefined, cfg("c1")));

    expect(out.totalDeals).toBe(0);
    expect(out.error).toContain(SCOPE_DENIED);
  });
});

describe("obtener_contacto — scope por interacción actual", () => {
  it("rechaza consultar un contacto ajeno a la interacción actual", async () => {
    const stores = createMockStores();
    const c = await stores.contacts.create({ name: "Actual", phone: "2" });
    await stores.deals.create({ contactId: c.id, title: "Mi deal", value: 100 });

    const tool = toolByName(createCrmTools(stores), "obtener_contacto");
    // Contacto ajeno: id distinto al de la interacción actual => denegado.
    const out = await tool.func({ id: "ajeno-123" }, undefined, cfg(c.id));

    expect(out).toContain("Acceso denegado");
  });

  it("sí permite consultar el contacto actual", async () => {
    const stores = createMockStores();
    const c = await stores.contacts.create({ name: "Actual", phone: "300" });
    await stores.deals.create({ contactId: c.id, title: "Mi deal", value: 100 });

    const tool = toolByName(createCrmTools(stores), "obtener_contacto");
    const out = JSON.parse(await tool.func({ id: c.id }, undefined, cfg(c.id)));

    expect(out.name).toBe("Actual");
    expect(out.deals).toHaveLength(1);
  });
});

describe("actualizar_etapa_deal — scope por interacción actual", () => {
  it("rechaza mover un deal que pertenece a otro contacto", async () => {
    const stores = createMockStores();
    await stores.deals.create({ contactId: "c1", title: "Mi deal", value: 100, stage: "lead" });
    const ajeno = await stores.deals.create({ contactId: "c2", title: "Deal ajeno", value: 999, stage: "lead" });

    const tool = toolByName(createCrmTools(stores), "actualizar_etapa_deal");
    const out = await tool.func({ dealId: ajeno.id, stage: "closed_won" }, undefined, cfg("c1"));

    expect(out).toContain("Acceso denegado");
  });

  it("sí permite mover un deal del contacto actual", async () => {
    const stores = createMockStores();
    const mine = await stores.deals.create({ contactId: "c1", title: "Mi deal", value: 100, stage: "lead" });

    const tool = toolByName(createCrmTools(stores), "actualizar_etapa_deal");
    const out = JSON.parse(await tool.func({ dealId: mine.id, stage: "closed_won" }, undefined, cfg("c1")));

    expect(out.stage).toBe("closed_won");
  });
});
