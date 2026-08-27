/**
 * seed-demo.mjs — Siembra datos demo del CRM
 *
 * Crea contactos, conversaciones, deals y tenants demo.
 *
 * Uso: node agentes/crm/seed-demo.mjs --force
 */

import { ContactStore } from "./stores/contact-store.mjs";
import { DealStore } from "./stores/deal-store.mjs";
import { ConversationStore } from "./stores/conversation-store.mjs";
import { TenantStore } from "./stores/tenant-store.mjs";
import { UsageStore } from "./stores/usage-store.mjs";
import { StoreFactory } from "./stores/store-factory.mjs";
import { TENANT_SEEDS } from "./config/tenants.mjs";

// ═════════════════════════════════════════════════════
// MOTOTRACTOR SEED (original, backward compatible)
// ═════════════════════════════════════════════════════

async function seedMototractor() {
  console.log("\n═══════════════════════════════════════════");
  console.log("   🏗️  SEMBRANDO CRM DEL MOTOTRACTOR");
  console.log("═══════════════════════════════════════════\n");

  const contactStore = ContactStore.getInstance();
  const existing = await contactStore.count();
  if (existing > 0) {
    console.log(`⚠️  Ya hay ${existing} contactos.`);
    if (!process.argv.includes("--force")) {
      console.log("💡 Usa --force para sobrescribir.\n");
      return;
    }
    for (const c of await contactStore.getAll()) await contactStore.delete(c.id);
    const ds = DealStore.getInstance();
    for (const d of await ds.getAll()) await ds.delete(d.id);
    const cs = ConversationStore.getInstance();
    for (const c of await cs.getAll()) await cs.delete(c.id);
    // Resetear contadores de uso para el seed
    const us = UsageStore.getInstance(null);
    await us.resetResource("all");
    console.log("🗑️  Datos anteriores eliminados.\n");
  }

  // Contactos
  const luis = await contactStore.create({ name: "Luis Hernández", phone: "+573101234567", email: "luis.hernandez@campocolombia.co", source: "webchat", company: "Finca El Progreso", tags: ["mototractor", "interesado-alto", "agricultor-ladera"] });
  console.log(`✅ ${luis.name} — Agricultor de ladera, Meta`);
  const maria = await contactStore.create({ name: "María Dolores Rincón", phone: "+573208765432", email: "maria.rincon@asociacioncampesina.org", source: "whatsapp", company: "Asociación Campesina de Productores", tags: ["mototractor", "cooperativa", "compra-grupal", "vip"] });
  console.log(`✅ ${maria.name} — Presidente de cooperativa, Boyacá`);
  const carlos = await contactStore.create({ name: "Carlos Arturo Pérez", phone: "+573009876543", email: "carlos.perez@tallermotos.com", source: "webchat", company: "Taller Mecánico Pérez", tags: ["mototractor", "mecanico", "distribuidor-potencial"] });
  console.log(`✅ ${carlos.name} — Mecánico, distribuidor potencial`);
  const ana = await contactStore.create({ name: "Ana María Castro", phone: "+573001112233", email: "ana.castro@alcaldiasanvicente.gov.co", source: "instagram", company: "Alcaldía de San Vicente", tags: ["mototractor", "gobierno", "programa-rural"] });
  console.log(`✅ ${ana.name} — Funcionaria pública`);
  const pedro = await contactStore.create({ name: "Pedro Pablo Sánchez", phone: "+573154445566", email: "pedro.sanchez@fincalosarrayanes.com", source: "webchat", company: "Finca Los Arrayanes", tags: ["mototractor", "soporte", "prototipo-anterior"] });
  console.log(`✅ ${pedro.name} — Usuario prototipo anterior`);
  const sofia = await contactStore.create({ name: "Sofía Ramírez", phone: "+573177778899", email: "sofia.ramirez@uniandes.edu.co", source: "webchat", company: "Universidad de los Andes", tags: ["mototractor", "investigador", "academia"] });
  console.log(`✅ ${sofia.name} — Investigadora`);

  // Conversaciones
  const convStore = ConversationStore.getInstance();
  const conv1 = await convStore.create({ contactId: luis.id, channel: "webchat" });
  await convStore.addMessage(conv1.id, "customer", "Hola, vi el Mototractor en internet. Tengo una finca en el Meta con terrenos de ladera. ¿Me sirve?");
  await convStore.addMessage(conv1.id, "ai", "¡Claro! El Mototractor está diseñado para terrenos de ladera — trabaja hasta 35° de pendiente.");
  await convStore.addMessage(conv1.id, "customer", "Tengo 3 hectáreas, ¿cuánto se demora preparando una?");
  await convStore.addMessage(conv1.id, "ai", "Aproximadamente 2-4 horas por hectárea, comparado con 32 días a azadón.");
  console.log(`✅ Conversación: Luis Hernández — ventas`);

  const conv2 = await convStore.create({ contactId: maria.id, channel: "whatsapp" });
  await convStore.addMessage(conv2.id, "customer", "Buenos días, somos 30 asociados interesados en el Mototractor. ¿Hay descuento grupal?");
  await convStore.addMessage(conv2.id, "ai", "¡Hola María! Sí, podemos ofrecer condiciones especiales para compra grupal.");
  await convStore.addMessage(conv2.id, "customer", "Perfecto, agendemos una llamada.");
  console.log(`✅ Conversación: María Rincón — compra grupal`);

  const conv3 = await convStore.create({ contactId: carlos.id, channel: "webchat" });
  await convStore.addMessage(conv3.id, "customer", "Hola, tengo un taller de motos. ¿Buscan distribuidores?");
  await convStore.addMessage(conv3.id, "ai", "¡Sí! El Mototractor usa componentes de moto y buscamos centros de servicio.");
  console.log(`✅ Conversación: Carlos Pérez — distribuidor`);

  const conv4 = await convStore.create({ contactId: pedro.id, channel: "webchat" });
  await convStore.addMessage(conv4.id, "customer", "Tengo un prototipo y la cadena se salta en subida.");
  await convStore.addMessage(conv4.id, "ai", "Puede ser tensión incorrecta o desgaste de piñones. Revisa la alineación.");
  console.log(`✅ Conversación: Pedro Sánchez — soporte técnico`);

  const conv5 = await convStore.create({ contactId: ana.id, channel: "instagram" });
  await convStore.addMessage(conv5.id, "customer", "Quiero presentar el Mototractor en el consejo municipal.");
  await convStore.addMessage(conv5.id, "ai", "¡Excelente! Te envío una propuesta formal con especificaciones.");
  console.log(`✅ Conversación: Ana Castro — institucional`);

  const conv6 = await convStore.create({ contactId: sofia.id, channel: "webchat" });
  await convStore.addMessage(conv6.id, "customer", "Investigo mecanización agrícola, ¿tienen datos de pruebas?");
  await convStore.addMessage(conv6.id, "ai", "Sí, pruebas en San Carlos de Guaroa, Meta. Fuerza por marcha y más.");
  console.log(`✅ Conversación: Sofía Ramírez — investigación`);

  // Deals
  const dealStore = DealStore.getInstance();
  await dealStore.create({ contactId: luis.id, title: "Kit Mototractor — Finca El Progreso (3 ha)", value: 4500, stage: "negotiation", source: "webchat" });
  await dealStore.create({ contactId: maria.id, title: "Compra Grupal 30 unid. — Asoc. Campesina Boyacá", value: 120000, stage: "proposal", source: "whatsapp" });
  await dealStore.create({ contactId: carlos.id, title: "Distribuidor Autorizado — Taller Pérez", value: 15000, stage: "qualified", source: "webchat" });
  await dealStore.create({ contactId: ana.id, title: "Programa Piloto Municipal — San Vicente", value: 35000, stage: "lead", source: "instagram" });
  await dealStore.create({ contactId: pedro.id, title: "Kit Actualización Prototipo 2023→2025", value: 1200, stage: "qualified", source: "webchat" });

  const pipelineSummary = await dealStore.getPipelineSummary();
  console.log("\n═══════════════════════════════════════════");
  console.log("   📊 RESUMEN CRM MOTOTRACTOR");
  console.log("═══════════════════════════════════════════\n");
  console.log(`   👤 Contactos:       ${await contactStore.count()}`);
  console.log(`   💬 Conversaciones:  ${await convStore.count()}`);
  console.log(`   💰 Deals:           ${await dealStore.count()}`);
  console.log(`   📈 Valor pipeline:  $${pipelineSummary.totalValue.toLocaleString()}`);
  console.log("\n✅ CRM del Mototractor listo!");
  console.log("   🌐 http://localhost:3030/chat\n");
}

// ═════════════════════════════════════════════════════
// MOTOSTABILY SEED (tenant multi-tenant)
// ═════════════════════════════════════════════════════

async function seedMotostabily() {
  console.log("\n═══════════════════════════════════════════");
  console.log("   🏗️  SEMBRANDO CRM DE MOTOSTABILY");
  console.log("═══════════════════════════════════════════\n");

  const stores = StoreFactory.forTenant("motostabily");
  const contactStore = stores.contacts;
  const convStore = stores.conversations;
  const dealStore = stores.deals;

  const existing = await contactStore.count();
  if (existing > 0) {
    console.log(`⚠️  Ya hay ${existing} contactos en motostabily.`);
    if (!process.argv.includes("--force")) {
      console.log("💡 Usa --force para sobrescribir.\n");
      return;
    }
    for (const c of await contactStore.getAll()) await contactStore.delete(c.id);
    for (const d of await dealStore.getAll()) await dealStore.delete(d.id);
    for (const c of await convStore.getAll()) await convStore.delete(c.id);
    console.log("🗑️  Datos anteriores eliminados.\n");
  }

  // Contactos de ventas MotoStabily
  const jorge = await contactStore.create({ name: "Jorge Armando Torres", phone: "+573102223344", email: "jorge.torres@fincaelroble.co", source: "webchat", company: "Finca El Roble", tags: ["motostabily", "interesado-alto", "agricultor-ladera"] });
  console.log(`✅ ${jorge.name} — Agricultor de ladera, Santander`);
  const camila = await contactStore.create({ name: "Camila Andrea Gómez", phone: "+573204445566", email: "camila.gomez@asociacioncampesina.org", source: "whatsapp", company: "Asociación Campesina de Boyacá", tags: ["motostabily", "cooperativa", "compra-grupal", "vip"] });
  console.log(`✅ ${camila.name} — Presidenta de cooperativa, Boyacá`);
  const jose = await contactStore.create({ name: "José David Martínez", phone: "+573006677889", email: "jose.martinez@talleragromotores.com", source: "webchat", company: "Taller AgroMotores", tags: ["motostabily", "mecanico", "distribuidor-potencial"] });
  console.log(`✅ ${jose.name} — Mecánico, distribuidor potencial`);

  // Conversaciones
  const conv1 = await convStore.create({ contactId: jorge.id, channel: "webchat" });
  await convStore.addMessage(conv1.id, "customer", "Hola, vi el MotoStabily en redes. Tengo una finca con terrenos empinados en Santander, ¿me sirve para preparar tierra?");
  await convStore.addMessage(conv1.id, "ai", "¡Claro! El MotoStabily trabaja hasta 35° de pendiente y prepara una hectárea en 2-4 horas, comparado con semanas a azadón.");
  await convStore.addMessage(conv1.id, "customer", "¿Y cuánto cuesta el kit completo?");
  await convStore.addMessage(conv1.id, "ai", "El kit completo con moto NKD 125cc 0km está en $15.000.000 COP. ¿Te interesa una cotización formal?");
  console.log(`✅ Conversación: Jorge Torres — pre-ventas`);

  const conv2 = await convStore.create({ contactId: camila.id, channel: "whatsapp" });
  await convStore.addMessage(conv2.id, "customer", "Buenos días, somos 25 asociados interesados. ¿Hay descuento por compra grupal?");
  await convStore.addMessage(conv2.id, "ai", "¡Hola Camila! Sí, manejamos condiciones especiales para compras grupales. ¿Agendamos una llamada para definir volúmenes?");
  console.log(`✅ Conversación: Camila Gómez — compra grupal`);

  const conv3 = await convStore.create({ contactId: jose.id, channel: "webchat" });
  await convStore.addMessage(conv3.id, "customer", "Hola, tengo taller de motos y tractores. ¿Buscan centros de servicio autorizados?");
  await convStore.addMessage(conv3.id, "ai", "¡Sí! El MotoStabily usa componentes de moto y estamos buscando centros de servicio aliados. Te comparto los requisitos.");
  console.log(`✅ Conversación: José Martínez — distribuidor`);

  // Deals
  await dealStore.create({ contactId: jorge.id, title: "Kit MotoStabily — Finca El Roble (2 ha)", value: 15000, stage: "negotiation", source: "webchat" });
  await dealStore.create({ contactId: camila.id, title: "Compra Grupal 25 unid. — Asoc. Boyacá", value: 350000, stage: "proposal", source: "whatsapp" });
  await dealStore.create({ contactId: jose.id, title: "Centro de Servicio Autorizado — AgroMotores", value: 10000, stage: "qualified", source: "webchat" });
  console.log("✅ 3 deals demo creados");

  const pipelineSummary = await dealStore.getPipelineSummary();
  console.log("\n═══════════════════════════════════════════");
  console.log("   📊 RESUMEN CRM MOTOSTABILY");
  console.log("═══════════════════════════════════════════\n");
  console.log(`   👤 Contactos:       ${await contactStore.count()}`);
  console.log(`   💬 Conversaciones:  ${await convStore.count()}`);
  console.log(`   💰 Deals:           ${await dealStore.count()}`);
  console.log(`   📈 Valor pipeline:  $${pipelineSummary.totalValue.toLocaleString()}`);
  console.log("\n✅ CRM de MotoStabily listo!");
  console.log("   🌐 http://localhost:3030/chat/motostabily\n");
}

// ═════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════
// TENANT SEED
// ═════════════════════════════════════════════════════

async function seedTenants() {
  const ts = TenantStore.getInstance();
  const existing = await ts.getAll();

  // ── Limpieza de duplicados previos ──
  // Eliminar tenants con slug "" o null que se crearon en seeds anteriores
  const toDelete = existing.filter(t => !t.slug || t.slug === "");
  for (const d of toDelete) {
    await ts._store.delete(d.id);
    console.log(`🗑️ Eliminado tenant duplicado: ${d.id.slice(0, 8)}... (slug vacío)`);
  }

  // También limpiar duplicados de slugs reales (conservar solo el primero)
  const seen = new Set();
  const dupes = [];
  for (const t of existing) {
    if (t.slug && seen.has(t.slug)) {
      dupes.push(t);
    }
    if (t.slug) seen.add(t.slug);
  }
  for (const d of dupes) {
    await ts._store.delete(d.id);
    console.log(`🗑️ Eliminado duplicado de ${d.slug}: ${d.id.slice(0, 8)}...`);
  }

  // Volver a leer el estado actual después de limpieza
  const cleanExisting = await ts.getAll();

  for (const seed of TENANT_SEEDS) {
    const match = cleanExisting.find(t => t.slug === seed.slug);
    if (match) {
      // Update existing
      match.plan = seed.plan;
      match.name = seed.name;
      match.branding = seed.branding;
      match.isActive = true;
      await ts._store.put(match);
      console.log(`✅ Tenant actualizado: ${seed.name} (${seed.plan})`);
    } else {
      const tenant = await ts.create({
        slug: seed.slug,
        name: seed.name,
        plan: seed.plan,
        branding: seed.branding,
        isActive: true,
      });
      console.log(`✅ Tenant creado: ${seed.name} (${seed.plan})`);
    }
  }
}

async function main() {
  await seedTenants();
  await seedMototractor();
  await seedMotostabily();
}

main().catch(console.error);
