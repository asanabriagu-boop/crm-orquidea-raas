/**
 * wa-tablet.js — Agente WhatsApp para Tableta (Termux)
 *
 * Arquitectura:
 *   Tableta (Baileys) ←→ WhatsApp
 *   Tableta ──HTTP──→ Laptop (POST /api/whatsapp-hook)
 *   Tableta ←─respuesta── Laptop (texto generado por DeepSeek)
 *
 * Uso en Termux (LAN):
 *   CRM_URL=http://192.168.1.X:3030 node wa-tablet.cjs 573134309594
 *
 * Uso en Termux (túnel público — cuando LAN no es accesible):
 *   CRM_PUBLIC_URL=https://xxxx.serveousercontent.com node wa-tablet.cjs 573134309594
 *
 * La URL pública del túnel aparece en la terminal de la laptop al ejecutar ./start-tablet.
 *
 * Variables de entorno:
 *   CRM_URL          — URL del servidor CRM en LAN (default: http://192.168.166.218:3030)
 *   CRM_PUBLIC_URL   — URL pública del túnel Serveo (si LAN no es accesible)
 *   PHONE            — número de teléfono (alternativa al argumento)
 *   TENANT           — slug del tenant (opcional)
 */

// ── Configuración de URLs ──
// Prioridad de conexión (en orden):
//   1. CRM_PUBLIC_URL (túnel Serveo, explícito)
//   2. CRM_DDNS      (DNS dinámico DuckDNS, si está configurado)
//   3. CRM_URL       (LAN directa)
//
// DuckDNS es ideal porque resuelve a la IP del host sin importar
// cómo cambie la red WiFi. El host actualiza DuckDNS vía cron cada 5 min.
const CRM_URL = process.env.CRM_URL || "";
const CRM_PUBLIC_URL = process.env.CRM_PUBLIC_URL || "";
const CRM_DDNS = process.env.CRM_DDNS || "";
const PHONE = process.argv[2] || process.env.PHONE;
const TENANT = process.argv[3] || process.env.TENANT || "";
// Transcripción vía proxy del CRM server (no necesita OPENAI_API_KEY local)


if (!PHONE) {
  console.error("Uso: node wa-tablet.cjs 573134309594");
  console.error("  o:  PHONE=573134309594 node wa-tablet.cjs");
  process.exit(1);
}

// ── Retry logic para fetch (red fluctúa en móvil/hotspot) ──
// Reintenta hasta 3 veces con backoff exponencial (1s, 3s, 5s)
// cuando el error es de red (fetch failed), no en errores HTTP.
async function fetchWithRetry(url, options = {}, retries = 3, timeoutMs = 180000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return res; // si llegó respuesta HTTP (incluso 4xx/5xx), no reintentar
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      const isTimeout = err.name === "AbortError";
      const delay = isTimeout ? 1000 : [1000, 3000, 5000][attempt - 1] || 3000;
      console.log(`  🔄 Reintento ${attempt}/${retries} en ${delay}ms... (${err.message})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ── Persistencia de IDs procesados (sobrevive reconexiones) ──
const path = require("path");
const fs = require("fs");
const PROCESSED_IDS_FILE = path.join(__dirname, ".wa_processed_ids.json");
const MAX_PERSISTED_IDS = 50000;

function loadProcessedIds() {
  try {
    const raw = fs.readFileSync(PROCESSED_IDS_FILE, "utf8");
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.slice(-MAX_PERSISTED_IDS) : []);
  } catch {
    return new Set();
  }
}

function saveProcessedIds(set) {
  try {
    const arr = [...set].slice(-MAX_PERSISTED_IDS);
    fs.writeFileSync(PROCESSED_IDS_FILE, JSON.stringify(arr));
  } catch (err) {
    console.error("⚠️ Error guardando IDs procesados:", err.message);
  }
}

// ── Baileys ──
const { makeWASocket, useMultiFileAuthState, DisconnectReason, getContentType, Browsers, downloadMediaMessage } = require("@whiskeysockets/baileys");
const pino = require("pino");

const AUTH_DIR = "./wa_auth";

async function start(phone) {
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`   📱 TABLETA — WhatsApp Bridge`);
  console.log(`   🎯 Número: ${phone}`);
  console.log(`   🖥️  CRM:    ${CRM_URL}`);
  console.log(`═══════════════════════════════════════════\n`);

  // ── Discovery automático de URL pública ──
  // Si se proporciona CRM_PUBLIC_URL, se usa directamente.
  // Si no, se intenta descubrir desde CRM_URL/api/discover.
  // La URL descubierta se usa para los webhooks, así funciona aunque
  // la tableta no esté en la misma LAN.
  const WEBHOOK_URL = await discoverWebhookUrl();
  if (!WEBHOOK_URL) {
    console.error(`❌ No se pudo determinar la URL del CRM.`);
    console.error(`   Asegúrate de que el CRM esté corriendo.`);
    console.error(`   Si la LAN no es accesible, usa CRM_PUBLIC_URL.`);
    process.exit(1);
  }
  console.log(`   📟 Webhook: ${WEBHOOK_URL}`);
  console.log(``);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  let sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: true,
    markOnlineOnConnect: true,
    browser: Browsers.ubuntu("Chrome"),
    logger: pino({ level: "silent" }),
  });

  sock.ev.on("creds.update", saveCreds);

  // ── Conexión ──
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && !sock.user) {
      try {
        const code = await sock.requestPairingCode(phone);
        const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log(`\n═══════════════════════════════════════════`);
        console.log(`   📱 CÓDIGO DE PAREAMIENTO:`);
        console.log(`   🎯 ${formatted}`);
        console.log(`═══════════════════════════════════════════`);
        console.log(`   Abre WhatsApp → Dispositivos vinculados`);
        console.log(`   → Vincular con código de 8 dígitos\n`);
      } catch (err) {
        console.error("❌ Error pairing code:", err.message);
      }
    }

    if (connection === "open") {
      console.log(`✅ WhatsApp conectado: ${sock.user?.name || sock.user?.id || "ok"}`);
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        // Persistir IDs procesados antes de reconectar
        saveProcessedIds(processedMsgIds);
        console.log("🔄 Reconectando en 10s...");
        setTimeout(() => start(phone), 10000);
      } else {
        console.log("❌ Sesión cerrada. Vuelve a ejecutar.");
        process.exit(1);
      }
    }
  });

  // ── Per-chat processing queue ──
  // Serializa el procesamiento por chat para evitar race conditions
  // cuando llegan múltiples mensajes simultáneamente.
  // Sin esto, el CRM recibe requests paralelos que se pisan entre sí y
  // generan respuestas duplicadas o contradictorias.
  const chatQueues = new Map(); // remoteJid → Promise chain

  function enqueueProcess(remoteJid, fn) {
    const prev = chatQueues.get(remoteJid) || Promise.resolve();
    const next = prev.then(fn, fn); // si la anterior falló, igual procesamos esta
    chatQueues.set(remoteJid, next);
    // Cleanup: remover del map cuando termine (con cláusula de seguridad)
    next.finally(() => {
      if (chatQueues.get(remoteJid) === next) {
        chatQueues.delete(remoteJid);
      }
    });
    return next;
  }

  // ── Mensajes entrantes ──
  // Procesa NOTIFY (tiempo real) y APPEND (historial al reconectar).
  // Los mensajes APPEND que ya fueron respondidos (ID en archivo persistente)
  // se saltan automáticamente.
  const processedMsgIds = loadProcessedIds();
  const MAX_DEDUP_SIZE = MAX_PERSISTED_IDS;

  // ── Segundo nivel de dedup: por CONTENIDO + remitente ──
  // Baileys puede emitir el mismo mensaje con DISTINTOS IDs (notify duplicado,
  // o notify + append con ID diferente). El dedup por ID no atrapa esos casos.
  // Este mapa guarda fingerprints (senderId + texto) con TTL de 30 segundos.
  const recentContent = new Map(); // fingerprint → timestamp
  const CONTENT_DEDUP_TTL = 30_000; // 30 segundos

  function isDuplicateContent(msg) {
    const content = extractText(msg);
    if (!content) return false;
    const senderId = msg.key.remoteJid.replace(/@(s\.whatsapp\.net|lid)$/, "");
    const fingerprint = `${senderId}:${content}`;
    const now = Date.now();
    const prev = recentContent.get(fingerprint);
    if (prev && (now - prev) < CONTENT_DEDUP_TTL) {
      console.log(`  ⏭️ Contenido duplicado de ${senderId}: "${content.slice(0, 40)}..."`);
      return true;
    }
    recentContent.set(fingerprint, now);
    // Limpiar fingerprints viejos
    if (recentContent.size > 1000) {
      for (const [key, ts] of recentContent) {
        if (now - ts > CONTENT_DEDUP_TTL) recentContent.delete(key);
      }
    }
    return false;
  }

  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveProcessedIds(processedMsgIds), 3000);
  };

  // ── Al reconectar: procesar historial (APPEND) ──
  // Acumula todos los mensajes APPEND durante N segundos, luego procesa
  // solo los NO DUPLICADOS y de las últimas 24h.
  let pendingAppendBuffer = [];
  let pendingAppendTimer = null;

  function processAppendMessages() {
    const batch = pendingAppendBuffer;
    pendingAppendBuffer = [];
    pendingAppendTimer = null;

    // ── Constante de delay entre requests para no saturar rate limiter ──
    const INTER_REQUEST_DELAY = 1200; // ms entre cada chat

    let pending = 0;
    let skipped = 0;

    // Filtrar solo mensajes de usuarios (no propios, no de estado)
    const userMessages = batch
      .filter(m => !m.key.fromMe && !m.key.remoteJid.endsWith("@status.broadcast"))
      .sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));

    // ═══ COLECTAR TODOS LOS MENSAJES POR CHAT ═══
    // En lugar de solo el último, recolectamos TODOS los mensajes pendientes
    // para que el CRM tenga contexto completo de lo que el cliente escribió
    // mientras estábamos desconectados. El CRM recibe el batch via `pendingContext`
    // y genera UNA respuesta coherente por chat.
    const allPerChat = new Map(); // remoteJid → msg[]
    for (const msg of userMessages) {
      const jid = msg.key.remoteJid;
      if (!allPerChat.has(jid)) allPerChat.set(jid, []);
      allPerChat.get(jid).push(msg);
    }

    // Procesar cada chat secuencialmente con delay
    let chatIndex = 0;
    const chatEntries = [...allPerChat.entries()];

    function processNextChat() {
      if (chatIndex >= chatEntries.length) {
        // Marcar TODOS los mensajes del batch como procesados
        for (const msg of userMessages) {
          if (msg.key.id) {
            processedMsgIds.add(msg.key.id);
          }
        }
        scheduleSave();

        if (pending > 0) {
          console.log(`📦 APPEND: ${pending} chat(s) respondidos, ${skipped} saltados, ${allPerChat.size} chats en total, ${userMessages.length} msgs en lote`);
        }
        return;
      }

      const [jid, msgs] = chatEntries[chatIndex];
      chatIndex++;

      // Filtrar duplicados por contenido y extraer textos
      const validMsgs = [];
      const allTexts = [];
      for (const m of msgs) {
        if (isDuplicateContent(m)) continue;
        const content = extractText(m);
        if (!content) continue;
        validMsgs.push(m);
        allTexts.push(content);
      }

      if (validMsgs.length === 0) {
        skipped += msgs.length;
        setTimeout(processNextChat, 100);
        return;
      }

      // pendingContext = todos excepto el último
      const pendingContext = allTexts.slice(0, -1);
      const lastText = allTexts[allTexts.length - 1];
      const lastMsg = validMsgs[validMsgs.length - 1];

      const senderId = jid.replace(/@(s\.whatsapp\.net|lid)$/, "");
      const senderName = (lastMsg.pushName || "").trim() || senderId;

      const batchInfo = pendingContext.length > 0
        ? ` (${allTexts.length} msgs pendientes)`
        : "";
      console.log(`📩 [APPEND][${senderName}]: ${lastText.slice(0, 60)}${batchInfo}`);
      pending++;

      // Marcar como leído el último mensaje (marca todo el chat como leído)
      sock.readMessages([lastMsg.key]).catch(() => {});

      enqueueProcess(jid, async () => {
        try {
          const res = await fetchWithRetry(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              senderId,
              senderName,
              text: lastText,
              pendingContext: pendingContext.length > 0 ? pendingContext : undefined,
              tenant: TENANT,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
          }
          const data = await res.json();
          if (data.success && data.answer) {
            await sock.sendMessage(jid, { text: data.answer });
            console.log(`✅ [APPEND] Respuesta enviada (${data.answer.length} chars)`);
          }
          await sock.readMessages([lastMsg.key]).catch(() => {});
        } catch (err) {
          console.error(`❌ [APPEND] Error: ${err.message}`);
        }
      });

      // Procesar el siguiente chat después del delay
      setTimeout(processNextChat, INTER_REQUEST_DELAY);
    }

    // Iniciar procesamiento secuencial
    processNextChat();
  }

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // ── APPEND: historial sincronizado al reconectar ──
    if (type === "append") {
      // Acumular todos los lotes APPEND en buffer
      pendingAppendBuffer.push(...messages);
      // Debounce: procesar tras 3s sin nuevos appends
      if (pendingAppendTimer) clearTimeout(pendingAppendTimer);
      pendingAppendTimer = setTimeout(processAppendMessages, 3000);
      return;
    }

    // ── NOTIFY: mensajes en tiempo real ──
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid.endsWith("@status.broadcast")) continue;

      // ── Silenciar mensajes sin contenido (acks de entrega/lectura, protocolo) ──
      if (!msg.message) continue;
      const contentType = getContentType(msg.message);
      if (!contentType || contentType === "protocolMessage") continue;

      // ── Dedup por ID (persistente) ──
      const msgId = msg.key.id;
      if (processedMsgIds.has(msgId)) continue;
      processedMsgIds.add(msgId);
      scheduleSave();

      // ── Dedup por contenido (mismo texto, IDs diferentes) ──
      if (isDuplicateContent(msg)) continue;
      if (processedMsgIds.size > MAX_DEDUP_SIZE) {
        const toDelete = [...processedMsgIds].slice(0, 1000);
        toDelete.forEach(id => processedMsgIds.delete(id));
      }

      // Marcar como leído para que desaparezca de la bandeja de entrada
      sock.readMessages([msg.key]).catch(() => {});

      // ═══ EXTRAER TEXTO (o transcribir audio) ═══
      let content = extractText(msg);

      if (!content && msg.message?.audioMessage) {
        content = await transcribeAudio(sock, msg);
      }

      if (!content) {
        const rawKeys = msg.message ? Object.keys(msg.message).join(", ") : "null";
        console.log(`  ⚠️ No se pudo extraer contenido (keys: ${rawKeys})`);
        continue;
      }

      const senderId = msg.key.remoteJid.replace(/@(s\.whatsapp\.net|lid)$/, "");
      const senderName = (msg.pushName || "").trim() || senderId;

      console.log(`📩 [${senderName}]: ${content.slice(0, 80)}`);

      // Procesar cada mensaje en serie por chat (fifo) para evitar race conditions
      await enqueueProcess(msg.key.remoteJid, async () => {
        // ── Indicador "escribiendo..." ──
        // Humaniza la espera mientras el CRM genera la respuesta.
        const typingInterval = setInterval(() => {
          sock.sendPresenceUpdate("composing", msg.key.remoteJid).catch(() => {});
        }, 4000);
        let typingStopped = false;
        const stopTyping = () => {
          if (typingStopped) return;
          typingStopped = true;
          clearInterval(typingInterval);
          sock.sendPresenceUpdate("paused", msg.key.remoteJid).catch(() => {});
        };

        try {
          const res = await fetchWithRetry(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senderId, senderName, text: content, tenant: TENANT }),
          });

          stopTyping();

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
          }

          const data = await res.json();
          if (data.success && data.answer) {
            // Partir respuestas largas en mensajes cortos para simular escritura humana
            const answerText = data.answer;
            if (answerText.length > 700) {
              await sendAsHuman(sock, msg.key.remoteJid, answerText);
            } else {
              await sock.sendMessage(msg.key.remoteJid, { text: answerText });
            }
            console.log(`✅ Respuesta enviada (${answerText.length} chars)`);
          } else if (data.success) {
            // Success sin answer — evitar ghost response, enviar fallback
            console.log(`⚠️ Respuesta vacía del CRM, enviando fallback`);
            await sock.sendMessage(msg.key.remoteJid, {
              text: "✅ Recibí tu mensaje. ¿En qué más puedo ayudarte?",
            });
          }
          // Marcar como leído para que desaparezca de la bandeja de entrada
          await sock.readMessages([msg.key]).catch(() => {});
        } catch (err) {
          stopTyping();
          console.error(`❌ Error: ${err.message}`);
          const fallback = "⚠️ Estoy teniendo problemas para procesar tu mensaje. Intenta de nuevo en un momento.";
          await sock.sendMessage(msg.key.remoteJid, { text: fallback }).catch(() => {});
        }
      });
    }
  });
}

/**
 * sendAsHuman — Envía una respuesta larga simulando escritura humana:
 * parte el texto en fragmentos, muestra "escribiendo..." entre cada uno,
 * y pausa ~1.5s por fragmento para que el cliente vea que "está escribiendo".
 */
async function sendAsHuman(sock, remoteJid, text) {
  const SIM_TYPING_SPEED = 30; // caracteres por segundo simulados
  const MAX_CHUNK = 700;       // caracteres máximos por fragmento (límite WhatsApp)
  const MAX_FRAGMENTS = 2;     // máximo 2 fragmentos para no saturar al cliente

  // 1. Partir por párrafos naturales (doble salto de línea)
  let paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    // Si este párrafo solo ya excede MAX_CHUNK, forzar corte
    if (para.length >= MAX_CHUNK) {
      if (current.trim()) chunks.push(current.trim());
      // Partir el párrafo grande en trozos de MAX_CHUNK
      for (let i = 0; i < para.length && chunks.length < MAX_FRAGMENTS; i += MAX_CHUNK) {
        chunks.push(para.slice(i, i + MAX_CHUNK).trim());
      }
      current = "";
      continue;
    }
    // Si añadir este párrafo excede el límite, cerrar chunk actual
    if (current.length + para.length > MAX_CHUNK && current.length > 0) {
      if (chunks.length < MAX_FRAGMENTS - 1) {
        chunks.push(current.trim());
        current = para;
      } else {
        // Último fragmento: agregar lo que quepa
        current += "\n\n" + para;
        break;
      }
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim() && chunks.length < MAX_FRAGMENTS) {
    chunks.push(current.trim());
  }

  // 2. Enviar cada chunk con "escribiendo..." intermedio
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      sock.sendPresenceUpdate("composing", remoteJid).catch(() => {});
      const pause = Math.max(600, (chunks[i].length / SIM_TYPING_SPEED) * 1000);
      await new Promise(r => setTimeout(r, pause));
    }

    await sock.sendMessage(remoteJid, { text: chunks[i] });

    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

function extractText(msg) {
  try {
    if (!msg.message) {
      return null;
    }
    const type = getContentType(msg.message);
    // Silenciar mensajes internos de protocolo WhatsApp (sincronización, reenvío, etc.)
    if (!type || type === "protocolMessage") return null;
    const c = msg.message[type];
    if (!c) {
      console.log(`  ⚠️ contenido para type=${type} es null`);
      return null;
    }
    // Log available fields
    const fields = Object.keys(c).filter(k => typeof c[k] !== 'object' || k === 'text');
    if (fields.length) console.log(`  🔍 campos en content: ${fields.join(", ")}`);

    if (c.text) return c.text;
    if (c.caption) return c.caption;
    if (c.buttonText?.displayText) return c.buttonText.displayText;
    if (c.listResponseMessage?.singleSelectReply?.selectedRowId) {
      return c.listResponseMessage.singleSelectReply.selectedRowId;
    }
    if (c.buttonsResponseMessage?.selectedButtonId) {
      return c.buttonsResponseMessage.selectedButtonId;
    }
    // Fallback: try conversation
    if (c.conversation) return c.conversation;
    if (c.extendedTextMessage?.text) return c.extendedTextMessage.text;
    if (c.documentWithCaptionMessage?.message?.documentMessage?.caption) {
      return c.documentWithCaptionMessage.message.documentMessage.caption;
    }
    // Direct from parent message
    if (msg.message.conversation) {
      console.log(`  ✅ msg.message.conversation direct: ${msg.message.conversation.slice(0,60)}`);
      return msg.message.conversation;
    }
    // DEBUG: dump raw JSON (truncated)
    const raw = JSON.stringify(c).slice(0, 300);
    console.log(`  🔍 RAW content: ${raw}`);
    const rawMsg = JSON.stringify(msg.message).slice(0, 300);
    console.log(`  🔍 RAW msg.message: ${rawMsg}`);
    console.log(`  ⚠️ No se pudo extraer texto de type=${type}`);
    return null;
  } catch (err) {
    console.log(`  ❌ extractText error: ${err.message}`);
    return null;
  }
}

/**
 * Descarga un mensaje de audio de WhatsApp y lo envía al CRM server
 * para que lo transcriba usando Whisper API (proxy).
 */
async function transcribeAudio(sock, msg) {
  try {
    console.log("🎤 Transcribiendo audio...");
    const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: pino({ level: "silent" }), reuploadRequest: sock });
    if (!buffer || buffer.length === 0) {
      console.log("  ⚠️ Buffer de audio vacío");
      return null;
    }
    console.log(`  📦 Audio descargado: ${(buffer.length / 1024).toFixed(1)} KB`);

    // Enviar al CRM server como base64
    const base64 = buffer.toString("base64");
    const transcribeBase = (CRM_PUBLIC_URL || CRM_DDNS || CRM_URL || "http://localhost:3030").replace(/\/+$/, "");
    const transcribeUrl = `${transcribeBase}/api/transcribe-audio`;
    const res = await fetchWithRetry(transcribeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: base64, mimeType: "audio/ogg; codecs=opus" }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.success || !data.text) {
      throw new Error("Respuesta inválida del servidor");
    }

    const text = data.text.trim();
    console.log(`  ✅ Transcripción (${text.length} chars): ${text.slice(0, 100)}`);
    return text ? `[🎤 Audio transcrito] ${text}` : null;
  } catch (err) {
    console.error(`  ❌ Error transcribiendo audio: ${err.message}`);
    return "[🎤 Audio recibido — no se pudo transcribir]";
  }
}

/**
 * Descubre la URL pública del webhook del CRM.
 * Prioridad: CRM_PUBLIC_URL > CRM_DDNS (DuckDNS) > discovery via CRM_URL/api/discover > CRM_URL directo
 */
async function discoverWebhookUrl() {
  // 1. CRM_PUBLIC_URL (túnel Serveo) — explícito
  if (CRM_PUBLIC_URL) {
    const base = CRM_PUBLIC_URL.replace(/\/+$/, "");
    console.log(`  🌐 Usando CRM_PUBLIC_URL (túnel): ${base}`);
    return `${base}/api/whatsapp-hook`;
  }

  // 2. CRM_DDNS (DuckDNS) — DNS dinámico, resuelve siempre a la IP del host
  if (CRM_DDNS) {
    const base = CRM_DDNS.replace(/\/+$/, "");
    console.log(`  🌐 Usando CRM_DDNS (DuckDNS): ${base}`);
    try {
      const res = await fetch(`${base}/api/discover`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.webhookUrl) {
          console.log(`  🌐 Discovery vía DuckDNS: ${data.publicUrl}`);
          return data.webhookUrl;
        }
      }
      console.log(`  ⚠️ DuckDNS responde pero discovery falló, usando DuckDNS directo`);
    } catch {
      console.log(`  ⚠️ DuckDNS no accesible desde esta red, intentando LAN...`);
    }
    // Si DuckDNS no responde, igual intentamos webhook directo
    return `${base}/api/whatsapp-hook`;
  }

  // 3. Intentar descubrir desde CRM_URL/api/discover
  if (CRM_URL) {
    try {
      const baseUrl = CRM_URL.replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/api/discover`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.webhookUrl) {
          console.log(`  🌐 Discovery automático via LAN: ${data.publicUrl}`);
          // Caso 1: Discovery devolvió DuckDNS pero el usuario pidió LAN explícitamente
          if (CRM_URL && data.method === "duckdns") {
            console.log(`  ⚠️ Discovery devolvió DuckDNS, pero usaremos LAN directa (CRM_URL)`);
            return `${baseUrl}/api/whatsapp-hook`;
          }
          // Caso 2: Discovery devolvió una IP/distinta a CRM_URL (IP del host stale)
          // Preferir CRM_URL que el usuario sabe que es la IP actual correcta.
          if (CRM_URL) {
            const discoveredHost = new URL(data.webhookUrl).hostname;
            const crmHost = new URL(baseUrl).hostname;
            if (discoveredHost !== crmHost) {
              console.log(`  ⚠️ Discovery devolvió ${discoveredHost}, pero CRM_URL=${crmHost} — usando CRM_URL`);
              return `${baseUrl}/api/whatsapp-hook`;
            }
          }
          return data.webhookUrl;
        }
      }
    } catch {
      // Discovery falló — típicamente porque la LAN no es accesible
    }
    // Si discovery falló pero CRM_URL está configurada, usarla directamente
    console.log(`  ⚠️ Discovery via LAN falló, usando CRM_URL directamente`);
    return `${CRM_URL.replace(/\/+$/, "")}/api/whatsapp-hook`;
  }

  // 4. Fallback: no hay URL configurada
  console.error(`❌ No hay URL configurada.`);
  console.error(`   Usa una de estas variables:`);
  console.error(`   - CRM_PUBLIC_URL (túnel Serveo — RECOMENDADO, no depende de IP)`);
  console.error(`   - CRM_DDNS        (DuckDNS o DNS dinámico propio)`);
  console.error(`   - CRM_URL          (IP LAN directa)`);
  return null;
}

start(PHONE);
