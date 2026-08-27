/**
 * knowledge.test.mjs — Tests de knowledge por tenant
 *
 * Verifica que MotoStabily tiene su propia marca/landing "ver producto en acción"
 * (2026-08-25: ya NO comparte la landing del Mototractor) y mantiene su propio
 * contacto de ventas/producción (Andrés Sanabria 321 417 1508).
 */
import { describe, it, expect } from "vitest";
import { getKnowledgeForTenant } from "../knowledge/knowledge-registry.mjs";

describe("Knowledge por tenant", () => {
  it("MotoStabily tiene su propia landing 'ver producto en acción'", () => {
    const stabily = getKnowledgeForTenant("motostabily");
    const mototractor = getKnowledgeForTenant("mototractor");

    // Marca social propia: el MotoStabily ya no comparte la landing del Mototractor.
    expect(stabily.general.ver_producto_url).toBeDefined();
    expect(stabily.general.ver_producto_url).toBe("https://beacons.ai/motostabily_oficial");
    expect(stabily.general.ver_producto_url).not.toBe(mototractor.general.ver_producto_url);
    // El Mototractor conserva su propia landing.
    expect(mototractor.general.ver_producto_url).toBe("https://beacons.ai/mototractor_oficial");
  });

  it("MotoStabily mantiene su propio contacto de ventas (Andrés Sanabria)", () => {
    const stabily = getKnowledgeForTenant("motostabily");
    const c = stabily.general.contacto_ventas_produccion;
    expect(c?.nombre).toBe("Andrés Sanabria");
    expect(c?.telefono).toBe("321 417 1508");
  });

  it("fallback: tenant desconocido usa el knowledge del Mototractor", () => {
    const fallback = getKnowledgeForTenant("desconocido");
    expect(fallback.general.name).toBe("Mototractor");
    expect(fallback.general.ver_producto_url).toBe("https://beacons.ai/mototractor_oficial");
  });

  it("MotoStabily define el tutorial de instalación en 7 pasos", () => {
    const stabily = getKnowledgeForTenant("motostabily");
    const tut = stabily.instalacion_tutorial;
    expect(tut).toBeDefined();
    expect(tut.pasos).toHaveLength(7);
    // cada paso tiene número, título y detalles
    for (const p of tut.pasos) {
      expect(typeof p.numero).toBe("number");
      expect(p.titulo).toBeTruthy();
      expect(p.detalles).toBeTruthy();
    }
    // video tutorial aún sin publicar (evita enlaces muertos)
    expect(stabily.general.video_tutorial).toBe("PENDIENTE_CDN");
  });

  it("fallback: un tenant sin tutorial no lo hereda (Mototractor)", () => {
    const mototractor = getKnowledgeForTenant("mototractor");
    expect(mototractor.instalacion_tutorial).toBeUndefined();
  });

  it("MotoStabily define la sección de factura electrónica (cierre de compra → correo)", () => {
    const stabily = getKnowledgeForTenant("motostabily");
    const fact = stabily.ficha_tecnica?.facturacion;
    expect(fact).toBeDefined();
    expect(fact.activo).toBe(true);
    expect(fact.trigger).toBeTruthy();
    // Frase para pedir proactivamente el correo.
    expect(fact.preguntar_email).toMatch(/correo/i);
    // Frase de confirmación templada con {email}.
    expect(fact.confirmar_envio).toContain("{email}");
    expect(fact.reglas.length).toBeGreaterThan(0);
    // No se pide en pre-venta, solo al cerrar la compra.
    expect(fact.reglas.join(" ")).toMatch(/closed_won/);
  });

  it("fallback: un tenant sin facturación no la hereda (Mototractor)", () => {
    const mototractor = getKnowledgeForTenant("mototractor");
    expect(mototractor.ficha_tecnica?.facturacion).toBeUndefined();
  });
});
