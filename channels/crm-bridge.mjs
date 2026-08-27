/**
 * crm-bridge.mjs — Puente Canales → CRM Agent (multi-tenant)
 *
 * Conecta mensajes entrantes con el agente CRM del tenant correspondiente.
 * Soporta Mototractor (default).
 */

import { StoreFactory } from "../stores/store-factory.mjs";
import { TenantStore } from "../stores/tenant-store.mjs";
import { getMultiAgent, extractAnswer, isFarewell, buildFarewell } from "../crm-multiagent.mjs";
import { getKnowledgeForTenant } from "../knowledge/knowledge-registry.mjs";
import { sendWhatsAppMessage } from "./whatsapp-channel.mjs";
import { sendInstagramMessage } from "./instagram-channel.mjs";
import { checkQuota, incrementUsage } from "../services/plan-enforcer.mjs";

// ── Per-conversation lock (serializa requests por chat) con timeout ──
const _bridgeLocks = new Map(); // conversationId → { promise, timer }
const BRIDGE_LOCK_TIMEOUT = 120_000; // 120s timeout

/**
 * Idempotencia: evita duplicar un mensaje `customer` (reenvíos por retry/timeout
 * en los canales). Retorna true solo si el contenido NO existe aún como último
 * mensaje del cliente en la conversación.
 */
async function shouldAppendCustomerMessage(convStore, conversationId, text) {
  const conv = await convStore.get(conversationId);
  const msgs = (conv && conv.messages) || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "customer") continue;
    // Si ya existe un mensaje del cliente igual → reenvío → descartar
    return m.content !== text;
  }
  return true; // sin mensajes de cliente previos → proceder
}

function enqueueBridge(convId, fn) {
  const prev = _bridgeLocks.get(convId);
  const prevPromise = prev ? prev.promise : Promise.resolve();
  const nextPromise = prevPromise.then(fn, fn);

  // Limpiar timer previo si existe
  if (prev && prev.timer) clearTimeout(prev.timer);

  // Timeout de seguridad: remover lock si expira
  const timer = setTimeout(() => {
    if (_bridgeLocks.get(convId)?.timer === timer) {
      _bridgeLocks.delete(convId);
      console.warn(`[bridge] Lock timeout for ${convId.slice(0,8)} — forcibly removed`);
    }
  }, BRIDGE_LOCK_TIMEOUT);

  const entry = { promise: nextPromise, timer };
  _bridgeLocks.set(convId, entry);

  nextPromise.finally(() => {
    if (_bridgeLocks.get(convId) === entry) {
      clearTimeout(timer);
      _bridgeLocks.delete(convId);
    }
  });
  return nextPromise;
}

export async function processIncomingMessage(event) {
  const { channel, senderId, senderName, text, tenant, pendingContext } = event;
  const tenantSlug = tenant || null;
  const tagPrefix = tenantSlug || "mototractor";

  try {
    // ── Quota check: razonamientos antes de procesar ──
    const quota = await checkQuota(tenantSlug, "razonamientos");
    if (!quota.allowed) {
      const errorMsg = `⚠️ ${quota.reason}`;
      console.log(`  ⛔ Quota excedida [${tagPrefix}]: ${quota.usage}/${quota.limit} razonamientos`);
      if (channel === "whatsapp") {
        try { await sendWhatsAppMessage(senderId, errorMsg); } catch (err) { console.error("[bridge] sendWhatsAppMessage failed:", err.message); }
      } else if (channel === "instagram") {
        try { await sendInstagramMessage(senderId, errorMsg); } catch (err) { console.error("[bridge] sendInstagramMessage failed:", err.message); }
      }
      // Para webchat igual devolvemos respuesta con el error
      return { contact: null, conversation: null, answer: errorMsg, quota: true };
    }

    const stores = StoreFactory.forTenant(tenantSlug);
    const contactStore = stores.contacts;
    const convStore = stores.conversations;
    const dealStore = stores.deals;

    let contact;

    if (channel === "whatsapp" || channel === "tablet") {
      contact = await contactStore.findByPhone(senderId);
      if (!contact) {
        contact = await contactStore.create({
          name: senderName || senderId,
          phone: senderId,
          source: "whatsapp",
          tags: ["auto-creado", "whatsapp", tagPrefix],
        });
        console.log(`👤 Nuevo contacto WhatsApp [${tagPrefix}]: ${contact.name}`);
      }
    } else if (channel === "instagram") {
      contact = await contactStore.findByPhone(senderId);
      if (!contact) {
        contact = await contactStore.create({
          name: senderName || senderId,
          phone: senderId,
          source: "instagram",
          tags: ["auto-creado", "instagram", tagPrefix],
        });
        console.log(`👤 Nuevo contacto Instagram [${tagPrefix}]: ${contact.name}`);
      }
    } else if (channel === "webchat") {
      contact = await contactStore.findByPhone(senderId);
      if (!contact) {
        contact = await contactStore.create({
          name: senderName || "Visitante",
          phone: senderId,
          source: "webchat",
          tags: ["auto-creado", "webchat", tagPrefix],
        });
        console.log(`👤 Nuevo contacto WebChat [${tagPrefix}]: ${contact.name}`);
      }
    } else {
      // Canal genérico — crear contacto por senderId
      contact = await contactStore.findByPhone(senderId);
      if (!contact) {
        contact = await contactStore.create({
          name: senderName || senderId,
          phone: senderId,
          source: channel,
          tags: ["auto-creado", channel, tagPrefix],
        });
        console.log(`👤 Nuevo contacto [${tagPrefix}/${channel}]: ${contact.name}`);
      }
    }

    if (!contact) {
      throw new Error(`No se pudo identificar/crear contacto para ${senderId}`);
    }

    contact.lastActivity = new Date().toISOString();
    await contactStore.put(contact);

    let conversations = await convStore.findByContact(contact.id);
    let conversation = conversations.find(c => c.status === "active" || c.status === "waiting");

    if (!conversation) {
      conversation = await convStore.create({
        contactId: contact.id,
        channel,
      });
      console.log(`💬 Nueva conversación [${tagPrefix}]: ${conversation.id.slice(0, 8)}...`);
    }

    // ═══ Serializar procesamiento por conversación ═══
    return enqueueBridge(conversation.id, async () => {
      // BATCH (tablet): mensajes acumulados mientras el CRM estuvo desconectado.
      // Se insertan primero (con dedupe) para dar contexto completo al agente.
      if (channel === "tablet" && Array.isArray(pendingContext) && pendingContext.length > 0) {
        for (const ctxMsg of pendingContext) {
          if (await shouldAppendCustomerMessage(convStore, conversation.id, ctxMsg)) {
            await convStore.addMessage(conversation.id, "customer", ctxMsg);
          } else {
            console.log(`⏭️ [bridge] pendingContext duplicado saltado: ${String(ctxMsg).slice(0, 40)}`);
          }
        }
      }

      // Dedupe anti-eco: evita insertar 2 veces el mismo mensaje del cliente
      if (await shouldAppendCustomerMessage(convStore, conversation.id, text)) {
        await convStore.addMessage(conversation.id, "customer", text);
      } else {
        console.log(`⏭️ [bridge] mensaje duplicado saltado: ${text.slice(0, 40)}`);
      }

      const deals = await dealStore.findByContact(contact.id);
      const activeDeals = deals.filter(d => !["closed_won", "closed_lost"].includes(d.stage));

      const updatedConv = await convStore.get(conversation.id);
      // SEGURIDAD: solo últimos 10 mensajes para evitar OOM
      const recentMessages = (updatedConv.messages || []).slice(-10);
      const transcript = recentMessages
        .map(m => `[${m.role}] ${m.content}`)
        .join("\n");

      // Resolver configuración del tenant para el agente
      let tenantConfig = null;
      if (tenantSlug) {
        try {
          const tenantStore = TenantStore.getInstance();
          const tenant = await tenantStore.findBySlug(tenantSlug);
          if (tenant) {
            tenantConfig = {
              slug: tenant.slug,
              name: tenant.name,
              branding: tenant.branding,
              plan: tenant.plan,
            };
          }
        } catch (err) { console.warn("[bridge] tenant config load failed:", err.message); }
      }
      // Si el agente no puede crearse/invocarse, responder el error genérico al cliente
      // (en lugar de dejar un rechazo huérfano dentro del lock de enqueueBridge).
      const agentErrorMsg = "⚠️ Lo siento, estoy teniendo problemas para procesar tu mensaje. Un agente humano te atenderá pronto.";
      let agent;
      try {
        agent = getMultiAgent(tenantConfig);
      } catch (agentErr) {
        console.error(`[bridge] Agent creation failed [${tagPrefix}]:`, agentErr.message);
        try {
          if (channel === "whatsapp") await sendWhatsAppMessage(senderId, agentErrorMsg);
          else if (channel === "instagram") await sendInstagramMessage(senderId, agentErrorMsg);
        } catch (sendErr) { console.error("[bridge] error notification send failed:", sendErr.message); }
        return { contact, conversation, answer: agentErrorMsg };
      }

      // Pre-fetch RAG docs for technical questions (evita tool loop → OOM)
      let ragDocs = null;
      if (text.length > 10) {
        try {
          const { retrieveMototractorDocs } = await import("../knowledge/rag-mototractor.mjs");
          ragDocs = await retrieveMototractorDocs(text, { topK: 2 });
        } catch (err) { console.warn("[bridge] RAG pre-fetch failed:", err.message); }
      }

      // Knowledge por tenant: contacto y dirección salen del knowledge del
      // tenant (para MotoStabily es Andrés Sanabria 321 417 1508, sin Ideagro).
      const kb = getKnowledgeForTenant(tenantConfig?.slug || null);
      const ocp = kb?.general?.contacto_ventas_produccion || null;
      const contactoVentas = ocp
        ? `${ocp.nombre} — ${ocp.telefono}`
        : "Ángela Cuadrado — 350 4515126";
      const direccion = kb?.general?.direccion;

      let contextParts = [
        `📱 Canal: ${channel}`,
        `👤 Contacto: ${contact.name} (${contact.phone || contact.email || "sin contacto"})`,
        `🏷️ Tags: ${contact.tags?.join(", ") || "ninguno"}`,
        activeDeals.length > 0
          ? `💰 Deals activos: ${activeDeals.map(d => `${d.title} ($${d.value} - ${d.stage})`).join(", ")}`
          : "💰 Sin deals activos",
        `🔒 Contexto actual (id del contacto): ${contact.id}`,
        ``,
        direccion
          ? `📍 Dirección oficial (única dirección real): ${direccion}`
          : `📍 Dirección oficial Ideagro (única dirección real): Grupo Industrial Ideagro S.A.S. — Calle 20 # 13-23, Barrio Capellanía, Cajicá, Colombia`,
        `📞 Contacto ventas: ${contactoVentas}`,
        `📞 Contacto servicio CRM: 3106743561`,
        ``,
        `📋 Historial de la conversación:`,
        transcript || "(sin historial)",
        ``,
        `---`,
      ];

      if (ragDocs && ragDocs.length > 0) {
        contextParts.push(
          ``,
          `📄 DOCUMENTACIÓN TÉCNICA RELEVANTE PRE-CARGADA (usa esto para responder):`,
          ...ragDocs.map((d, i) =>
            `[${i + 1}] ${d.metadata?.name || "Documento"} (${d.metadata?.category || "general"})\n${d.content.substring(0, 2000)}`
          ),
          ``,
          `---`,
        );
      }

      // ── RED DE SEGURIDAD DETERMINISTA: despedida cordial cuando el cliente
      //    finaliza la conversación ("es todo por hoy", "chao", "gracias, es todo"...).
      //    Evita que el LLM regurgite feed o siga vendiendo ante un cierre.
      //    Correcto según el cliente: cierre cordial con Ángela. NO genera razonamiento.
      let answer = null;
      if (isFarewell(text)) {
        // Despedida determinista por tenant: usa el contacto de ventas/producción
        // del knowledge del tenant (MotoStabily → Andrés Sanabria 321 417 1508).
        // buildFarewell cae en FAREWELL (Ángela/Mototractor) si el tenant no
        // define contacto propio.
        answer = buildFarewell(kb);
        console.log(`👋 Despedida detectada [${tagPrefix}]: respuesta determinista (${text.slice(0, 40)})`);
      }

      // Invoke con Promise.race + AbortController: garantiza respetar el timeout de 60s
      // aunque el SDK/agente ignore la señal de abort (evita cuelgue indefinido).
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const errorMsg = "⚠️ El asistente está tardando más de lo esperado. Por favor, intenta de nuevo.";
      let result;
      if (answer !== null) {
        result = null; // no invocamos al agente: cierre determinista
        clearTimeout(timeoutId);
      } else {
        try {
          const invokePromise = agent.invoke({
            messages: [
              { role: "system", content: contextParts.join("\n") },
              { role: "user", content: text },
            ],
            signal: controller.signal,
          }, {
            // SCOPEO DE PRIVACIDAD: propaga el contactId del cliente actual a
            // las tools (vía config.configurable) para que listar_deals y
            // resumen_pipeline queden restringidos a este contacto.
            configurable: { contactId: contact.id },
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("agent_invoke_timeout")), 60000)
          );
          result = await Promise.race([invokePromise, timeoutPromise]);
        } catch (invokeErr) {
          console.error(`[bridge] Agent invoke timeout/error [${tagPrefix}]:`, invokeErr.message);
          if (channel === "whatsapp") await sendWhatsAppMessage(senderId, errorMsg);
          else if (channel === "instagram") await sendInstagramMessage(senderId, errorMsg);
          return { contact, conversation, answer: errorMsg };
        } finally {
          clearTimeout(timeoutId);
        }
      }

      // Si la red de seguridad ya produjo una despedida determinista, usarla;
      // en caso contrario extraer la respuesta del agente.
      answer = answer ?? extractAnswer(result, kb);

      // Debug: ver formato exacto de la respuesta
      console.log("🔍 TIPO answer:", typeof answer, Array.isArray(answer) ? "array" : "no-array");
      if (typeof answer !== "string") {
        console.log("🔍 answer RAW:", JSON.stringify(answer).slice(0, 500));
      }

      // ── SANITIZAR: Forzar a string ──
      if (typeof answer !== "string") {
        if (Array.isArray(answer)) {
          answer = answer
            .filter(c => c.type === "text" || c.type === undefined)
            .map(c => c.text || c.content || "")
            .join("\n");
        } else {
          answer = String(answer);
        }
      }

      // ── STRIP: Eliminar cualquier metadata interna o transcript que el agente haya regurgitado ──
      answer = answer
        // Bloque completo de "📋 Historial de la conversación:" hasta "---" o fin
        .replace(/📋 Historial de la conversación:[\s\S]*?(---|$)/g, "")
        // Bloque de "📄 DOCUMENTACIÓN TÉCNICA" hasta "---" o fin
        .replace(/📄 DOCUMENTACIÓN TÉCNICA RELEVANTE[\s\S]*?(---|$)/g, "")
        // Líneas sueltas con metadata interna
        .replace(/^📱 Canal:.*$/gm, "")
        .replace(/^👤 Contacto:.*$/gm, "")
        .replace(/^🏷️ Tags:.*$/gm, "")
        .replace(/^💰 (Deals activos|Sin deals activos).*$/gm, "")
        .replace(/^---[\s\S]*?---/gm, "")
        // Strip de tool_call info cruda
        .replace(/\[tool_call[^\]]*\][\s\S]*?\[\/tool_call\]/g, "")
        .replace(/"tool_calls":\{[^}]*\}/g, "")
        // Múltiples newlines → 1
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      // ── STRIP RAZONAMIENTO: DeepSeek a veces antepone su cadena de
      //    razonamiento interno (en español o inglés) a la respuesta real.
      //    E.g. "El cliente está confirmando que solo son 7 pasos...\n\n¡Exacto, ⚖️!..."
      //    Elimina ese preámbulo para que el cliente SOLO vea la respuesta.
      answer = stripReasoningPreamble(answer);

      // ── HALLUCINATION GUARD: detectar direcciones falsas ──
      const fakeAddresses = ["sutamarchán", "sutamarchan", "tunja", "calle falsa", "cra falsa"];
      const lowerAnswer = answer.toLowerCase();
      for (const fake of fakeAddresses) {
        if (lowerAnswer.includes(fake) && !lowerAnswer.includes("oficial")) {
          console.warn(`⚠️ HALLUCINATION DETECTED: dirección falsa '${fake}' en respuesta para ${contact.name}`);
          answer = "No tengo información sobre esa ubicación. La dirección oficial de Ideagro es: Grupo Industrial Ideagro S.A.S. — Calle 20 # 13-23, Barrio Capellanía, Cajicá, Colombia. Si necesitas más detalles, puedes contactar a Ángela Cuadrado al 350 4515126.";
          break;
        }
      }

      // ── STRIP MARKDOWN: Si aun así llega markdown, limpiar para WhatsApp ──
      if (channel === "webchat") {
        answer = answer
          .replace(/^#+\s+(.+)$/gm, "<strong>$1</strong>")
          .replace(/^\s*[\*\-]\s(.+)$/gm, "<br>• $1")
          .replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/\*/g, "")
          .replace(/(?:<br>\s*){2,}/gi, "<br>")
          .replace(/(?:<br>\s*)+<\/table>/gi, "</table>")
          .replace(/<br>\s*<table/gi, "<table")
          .replace(/<\/table>\s*<br>/gi, "</table>")
          .trim();
      }

      // ── STRIP HTML Y MARKDOWN PARA WHATSAPP/TABLET/INSTAGRAM ──
      if (channel === "whatsapp" || channel === "tablet" || channel === "instagram") {
        answer = answer
          // Remover tablas HTML completas
          .replace(/<table[^>]*>[\s\S]*?<\/table>/gi, "")
          // Remover cualquier otra etiqueta HTML
          .replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, "")
          // Remover markdown syntax
          .replace(/^#+\s+/gm, "")
          .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/`{1,3}[^`]*`{1,3}/g, "")
          .replace(/~~([\s\S]*?)~~/g, "$1")
          // Múltiples newlines → máximo 2
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      // ── SANITY CHECK: Si después de limpiar queda vacío, mensaje genérico ──
      if (!answer || answer.length < 10) {
        answer = "✅ Recibí tu mensaje. ¿En qué más puedo ayudarte?";
      }

      await convStore.addMessage(conversation.id, "ai", answer);

      // ── ENVÍO CON SPLIT: WhatsApp tiene límite de ~700 caracteres ──
      if (channel === "whatsapp") {
        const fragments = splitMessage(answer, 700, 2);
        for (let i = 0; i < fragments.length; i++) {
          await sendWhatsAppMessage(senderId, fragments[i]);
          // Pausa de 800ms entre fragmentos para simular escritura natural
          if (i < fragments.length - 1) {
            await new Promise(r => setTimeout(r, 800));
          }
        }
      } else if (channel === "instagram") {
        const fragments = splitMessage(answer, 700, 2);
        for (let i = 0; i < fragments.length; i++) {
          await sendInstagramMessage(senderId, fragments[i]);
          if (i < fragments.length - 1) {
            await new Promise(r => setTimeout(r, 800));
          }
        }
      }
      // webchat no necesita enviar — el server HTTP devuelve answer en la respuesta

      contact.conversationCount = (contact.conversationCount || 0) + 1;
      await contactStore.put(contact);

      // Incrementar contador de razonamiento usado
      await incrementUsage(tenantSlug, "razonamientos").catch(err => console.error("[bridge] usage increment failed:", err.message));

      console.log(`✅ Respuesta [${tagPrefix}] enviada a ${contact.name} (${answer.length} chars)`);
      return { contact, conversation: updatedConv, answer };
    });

  } catch (err) {
    console.error(`❌ Bridge error [${channel}]:`, err.message);
    try {
      const errorMsg = "⚠️ Lo siento, estoy teniendo problemas para procesar tu mensaje. Un agente humano te atenderá pronto.";
      if (channel === "whatsapp") {
        await sendWhatsAppMessage(senderId, errorMsg);
      } else if (channel === "instagram") {
        await sendInstagramMessage(senderId, errorMsg);
      }
    } catch (err) { console.error("[bridge] error notification send failed:", err.message); }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
//  STRIP DE PREÁMBULO DE RAZONAMIENTO (anti-fuga de chain-of-thought)
//
//  DeepSeek (deepseek-chat / V3) a veces antepone su razonamiento INTERNO
//  a la respuesta real, tanto en inglés como en español. Eso filtra al
//  cliente las instrucciones/lógica del bot (p. ej. "The customer is asking
//  for installation information. According to my instructions... I enter
//  TUTORIAL MODE...\n\nLet me start...\n\nHola ⚖️...").
//
//  Este saneador es determinista y conservador: SOLO corta cuando el texto
//  arranca con un preámbulo claramente autorreferencial/planificador y deja
//  la respuesta real (saludo/emoji típicos del CRM) intacta. Si no hay
//  suficiente confianza, no toca nada.
// ─────────────────────────────────────────────────────────────

// Patrones que marcan el INICIO de un párrafo de razonamiento interno
// (primera persona o tercera persona autorreferente, o frase de planificación).
const REASONING_OPEN = [
  /^el cliente (ya|está|me|quiere|pidió|confirmó)/i,
  /^la clienta /i,
  /^the customer /i,
  /^the user /i,
  /^el usuario /i,
  /^según mis instrucciones/i,
  /^de acuerdo (a|con) mis instrucciones/i,
  /^according to my instructions/i,
  /^mi instrucción/i,
  /^mi función/i,
  /^yo (debo|puedo|voy|tengo|necesito)/i,
  /^debo (confirmar|responder|decirle|hacer|gu)/i,
  /^puedo (compartir|dar|enviar|devolver|ayudar|confirmar)/i,
  /^lo que voy a hacer/i,
  /^ya le compartí/i,
  /^parece que /i,
  /^(let me|i will|i should|i can|i need|i'm going to|ok let me|so let me|i think)/i,
  /^confirmo (que|el|la)|^confirmé/i,
  /^está confirmando/i,
  /^el cliente preguntó/i,
];

// Patrones que marcan el INICIO de la respuesta REAL dirigida al cliente.
// El bot de este CRM típicamente abre con saludo/emoji/exclamación o una
// frase directa en segunda persona; no con análisis interno.
const REPLY_OPEN = [
  /^¡/,                 // "¡Perfecto!", "¡Claro!", "¡Exacto!"
  /^!/,
  /^(hola|claro|perfecto|excelente|listo|exacto|genial|entiendo)[\s,.!:]?/i,
  /^con gusto/i,
  /^aqu[íi] tienes/i,
  /^puedes ver/i,
  /^tienes las (siguientes )?opciones/i,
  /^tienes estas/i,
  /^(tu|su|usted|me confirma|me gustaría)/i,
  /^(el moto|el producto|el dispositivo)/i,
  /^(son |es |hay |el precio|los precios)/i,
  /^recuerdas? (que |donde |el |la |las |los |cual |cuál )/i,
  /^(pedido|tu pedido|tu compra|su compra)/i,
];

function isReplyParagraph(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Respuesta que empieza con emoji (muy típico de este CRM: "Hola ⚖️", "😊")
  if (/\p{Emoji}/u.test(trimmed.slice(0, 3))) return true;
  return REPLY_OPEN.some((re) => re.test(trimmed));
}

function isReasoningParagraph(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return REASONING_OPEN.some((re) => re.test(trimmed));
}

/**
 * stripReasoningPreamble(text) → string
 *
 * Elimina el preámbulo de razonamiento que DeepSeek pueda anteponer a la
 * respuesta real. Conservador: si no detecta con confianza un preámbulo
 * autorreferencial, devuelve el texto sin cambios.
 */
export function stripReasoningPreamble(text) {
  if (typeof text !== "string" || !text.trim()) return text;

  const paragraphs = text.split(/\n\s*\n/);

  // El primer párrafo debe lucir como razonamiento interno; si no, no hay nada
  // que limpiar (respuesta legítima directa).
  if (!isReasoningParagraph(paragraphs[0])) return text;

  // Avanzar por los párrafos buscando el primero que sea claramente la
  // respuesta dirigida al cliente. Saltamos párrafos intermedios que sigan
  // siendo razonamiento (p. ej. "Let me start with the reception...") hasta
  // dar con el saludo real.
  for (let i = 1; i < paragraphs.length; i++) {
    if (isReplyParagraph(paragraphs[i])) {
      const rest = paragraphs.slice(i).join("\n\n").trim();
      return rest.length >= 10 ? rest : text;
    }
  }

  // No encontramos un párrafo de respuesta inequívoco: en lugar de talar
  // contenido legítimo, devolvemos el texto original sin modificarlo.
  return text;
}

/**
 * Divide un mensaje en fragmentos de máximo `maxLen` caracteres,
 * máximo `maxFragments` fragmentos.
 * Corta en saltos de línea o puntos para no partir palabras.
 */
function splitMessage(text, maxLen = 700, maxFragments = 2) {
  if (text.length <= maxLen) return [text];

  const parts = [];
  let remaining = text;

  for (let f = 0; f < maxFragments && remaining.length > 0; f++) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }

    // Buscar punto de corte: último \n\n o \n o . dentro del límite
    let cut = remaining.lastIndexOf("\n\n", maxLen);
    if (cut < maxLen / 2) cut = remaining.lastIndexOf("\n", maxLen);
    if (cut < maxLen / 2) cut = remaining.lastIndexOf(". ", maxLen);
    if (cut < maxLen / 2) cut = maxLen;

    const fragment = remaining.slice(0, cut).trim();
    if (fragment) parts.push(fragment + (f < maxFragments - 1 ? "" : ""));
    remaining = remaining.slice(cut).trim();
  }

  // Si queda texto sin enviar y no pasamos de maxFragments, agregarlo
  if (remaining.length > 0 && parts.length < maxFragments) {
    parts.push(remaining);
  }

  return parts.length > 0 ? parts : [text.slice(0, maxLen)];
}
