#!/usr/bin/env node
/**
 * crm-cli.mjs — CLI interactivo del CRM Conversacional
 *
 * Uso:
 *   node agentes/crm/crm-cli.mjs                             ← modo interactivo
 *   node agentes/crm/crm-cli.mjs "crea un contacto llamado Pedro"
 *   node agentes/crm/crm-cli.mjs "cómo va el pipeline de ventas"
 *   node agentes/crm/crm-cli.mjs "qué conversaciones activas hay"
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════
// PRE-FLIGHT: seed data if empty
// ═══════════════════════════════════════════════

async function ensureSeedData() {
  try {
    execSync(`node ${path.join(__dirname, "seed-demo.mjs")}`, {
      encoding: "utf-8",
      cwd: path.join(__dirname, "../.."),
    });
  } catch (err) {
    // Already seeded, ignore
  }
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

const question = process.argv.slice(2).join(" ");

if (question) {
  // Modo single-shot: consulta directa
  const { getMultiAgent, extractAnswer } = await import("./crm-multiagent.mjs");
  const agent = getMultiAgent();
  const result = await agent.invoke({
    messages: [{ role: "user", content: question }],
  });
  console.log("\n" + extractAnswer(result));
  process.exit(0);
}

// ── Modo interactivo ──
await ensureSeedData();

const { getMultiAgent, extractAnswer } = await import("./crm-multiagent.mjs");
const agent = getMultiAgent();

console.log("\n═══════════════════════════════════════════");
console.log("   🏗️  CRM CONVERSACIONAL — Modo interactivo");
console.log("   🤖 Powered by LangChain + DeepSeek");
console.log("═══════════════════════════════════════════\n");

console.log("📋 COMANDOS:");
console.log("   /resumen     — Resumen del pipeline de ventas");
console.log("   /contactos   — Listar todos los contactos");
console.log("   /deals       — Listar todos los deals");
console.log("   /activas     — Conversaciones activas");
console.log("   /help        — Mostrar este mensaje");
console.log("   /exit        — Salir\n");

console.log("💡 Escribe tu consulta en lenguaje natural:");
console.log('   Ej: "crea un contacto llamado Pedro con teléfono 3001234567"');
console.log('   Ej: "qué conversaciones tiene María García"');
console.log('   Ej: "muéstrame el pipeline de ventas"');
console.log('   Ej: "mueve el deal de Carlos a negotiation"');
console.log("");

import readline from "readline";
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "CRM> ",
});

rl.prompt();

for await (const line of rl) {
  const input = line.trim();

  if (!input) { rl.prompt(); continue; }
  if (input === "/exit" || input === "/quit") {
    console.log("👋 ¡Hasta luego!\n");
    rl.close();
    break;
  }
  if (input === "/help") {
    console.log("   /resumen     — Resumen del pipeline");
    console.log("   /contactos   — Listar todos los contactos");
    console.log("   /deals       — Listar todos los deals");
    console.log("   /activas     — Conversaciones activas");
    console.log("   /exit        — Salir\n");
    rl.prompt();
    continue;
  }
  if (input === "/resumen") {
    const { DealStore } = await import("./stores/deal-store.mjs");
    const summary = await DealStore.getInstance().getPipelineSummary();
    console.log(`\n📊 PIPELINE DE VENTAS`);
    console.log(`   Total deals: ${summary.totalDeals}`);
    console.log(`   Valor total: $${summary.totalValue}`);
    for (const [stage, count] of Object.entries(summary.stages)) {
      console.log(`   ${stage}: ${count}`);
    }
    console.log("");
    rl.prompt();
    continue;
  }
  if (input === "/contactos") {
    const { ContactStore } = await import("./stores/contact-store.mjs");
    const contacts = await ContactStore.getInstance().getAll();
    console.log(`\n👤 CONTACTOS (${contacts.length}):`);
    for (const c of contacts) {
      console.log(`   ${c.name.padEnd(20)} ${c.phone.padEnd(15)} ${c.source.padEnd(12)} [${c.tags?.join(", ") || ""}]`);
    }
    console.log("");
    rl.prompt();
    continue;
  }
  if (input === "/deals") {
    const { DealStore } = await import("./stores/deal-store.mjs");
    const deals = await DealStore.getInstance().getAll();
    console.log(`\n💰 DEALS (${deals.length}):`);
    for (const d of deals) {
      console.log(`   ${d.title.padEnd(40)} $${String(d.value).padEnd(8)} ${d.stage}`);
    }
    console.log("");
    rl.prompt();
    continue;
  }
  if (input === "/activas") {
    const { ConversationStore } = await import("./stores/conversation-store.mjs");
    const convs = await ConversationStore.getInstance().findByStatus("active");
    console.log(`\n💬 CONVERSACIONES ACTIVAS (${convs.length}):`);
    for (const c of convs) {
      console.log(`   ${c.channel.padEnd(12)} contacto: ${c.contactId.slice(0, 8)}...  mensajes: ${c.messages?.length || 0}`);
    }
    console.log("");
    rl.prompt();
    continue;
  }

  // Consulta al CRM Agent
  try {
    console.log("");
    const result = await agent.invoke({
      messages: [{ role: "user", content: input }],
    });
    const answer = extractAnswer(result);
    console.log(answer);
    console.log("");
  } catch (err) {
    console.log(`❌ Error: ${err.message}\n`);
  }

  rl.prompt();
}
