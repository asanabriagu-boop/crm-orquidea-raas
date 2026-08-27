/**
 * whatsapp-channel.mjs — Canal WhatsApp real via Baileys (Pairing Code)
 *
 * Usa código de 8 dígitos en vez de QR (funciona en entornos sin WebSocket visual).
 * 1. Te pido tu número de teléfono
 * 2. Baileys genera un código de 8 dígitos
 * 3. Abres WhatsApp → Dispositivos vinculados → Vincular con código de 8 dígitos
 * 4. Listo! Mensajes entrantes → Bridge → CRM Agent → Respuesta automática
 *
 * Uso: import { startWhatsApp, requestPairingCode, getWhatsAppStatus } from "./whatsapp-channel.mjs";
 */

import "dotenv/config";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  getContentType,
  Browsers,
} from "@whiskeysockets/baileys";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.resolve(__dirname, "../data/whatsapp-auth");

let sock = null;
let onMessageCallback = null;

// ── Estado ──
let _pairingCode = null;
let _codeLastUpdate = null;
let _connectionState = "disconnected";
let _phoneNumber = null;
let _reconnectAttempt = 0;

/**
 * Registra callback para mensajes entrantes.
 */
export function onWhatsAppMessage(callback) {
  onMessageCallback = callback;
}

/**
 * Obtiene el código de pareamiento actual o el estado.
 */
export function getPairingData() {
  return {
    code: _pairingCode,
    updatedAt: _codeLastUpdate,
    connectionState: _connectionState,
    phoneNumber: _phoneNumber,
  };
}

export function getWhatsAppStatus() {
  return {
    connected: sock?.user ? true : false,
    connectionState: _connectionState,
    hasPairingCode: !!_pairingCode,
    user: sock?.user
      ? { id: sock.user.id, name: sock.user.name || "desconocido" }
      : null,
  };
}

/**
 * Inicia conexión WhatsApp y solicita pairing code.
 * @param {string} phoneNumber - Número con código de país, ej: "573001234567"
 */
export async function startWhatsApp(phoneNumber) {
  if (!phoneNumber) {
    throw new Error("Número de teléfono requerido. Ej: 573001234567");
  }

  _pairingCode = null;
  _codeLastUpdate = null;
  _connectionState = "connecting";
  _phoneNumber = phoneNumber.replace(/[^0-9]/g, ""); // limpiar formato
  _reconnectAttempt = 0;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    browser: Browsers.ubuntu("Chrome"),
  });

  sock.ev.on("creds.update", saveCreds);

  // ── Escuchar eventos de conexión ──
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    // Si recibimos QR y no estamos autenticados, pedimos pairing code
    if (qr && !sock?.user) {
      try {
        _connectionState = "requesting_code";
        console.log(`📱 WhatsApp: Solicitando código de pareamiento para ${_phoneNumber}...`);
        let code = await sock.requestPairingCode(_phoneNumber);
        // Formatear como grupo de 4 dígitos para mejor lectura
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        _pairingCode = code;
        _codeLastUpdate = new Date().toISOString();
        _connectionState = "awaiting_pair";
        console.log(`\n═══════════════════════════════════════════`);
        console.log(`   📱 CÓDIGO DE PAREAMIENTO:`);
        console.log(`   🎯 ${code}`);
        console.log(`═══════════════════════════════════════════\n`);
        console.log("   Abre WhatsApp en tu celular →");
        console.log("   Dispositivos vinculados → Vincular dispositivo");
        console.log("   Y en vez de escanear QR, toca");
        console.log("   'Vincular con código de 8 dígitos'\n");
      } catch (err) {
        console.error("❌ Error solicitando pairing code:", err.message);
        _connectionState = "pairing_error";
      }
    }

    if (connection === "open") {
      _connectionState = "connected";
      _pairingCode = null;
      console.log(`✅ WhatsApp conectado como ${sock?.user?.name || sock?.user?.id || "desconocido"}`);
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        _reconnectAttempt++;
        // Exponential backoff: 10s, 30s, 90s, 180s, 300s max
        const delay = Math.min(5000 * Math.pow(3, _reconnectAttempt - 1), 300000);
        _connectionState = "reconnecting";
        console.log(`🔄 WhatsApp reconexión #${_reconnectAttempt} en ${Math.round(delay/1000)}s...`);
        setTimeout(() => startWhatsApp(_phoneNumber), delay);
      } else {
        _connectionState = "logged_out";
        _reconnectAttempt = 0;
        console.log("❌ WhatsApp: Sesión cerrada. Vuelve a iniciar.");
        sock = null;
      }
    }
  });

  // ── Mensajes entrantes ──
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid.endsWith("@status.broadcast")) continue;

      const content = extractMessageContent(msg);
      if (!content) continue;

      const sender = msg.key.remoteJid.replace("@s.whatsapp.net", "");
      const pushName = msg.pushName || sender;

      console.log(`📩 WhatsApp [${pushName}]: ${content.slice(0, 80)}${content.length > 80 ? "..." : ""}`);

      if (onMessageCallback) {
        try {
          await onMessageCallback({
            channel: "whatsapp",
            senderId: sender,
            senderName: pushName,
            text: content,
            raw: msg,
          });
        } catch (err) {
          console.error("❌ Error en callback WhatsApp:", err.message);
        }
      }
    }
  });

  return sock;
}

/**
 * Envía un mensaje de WhatsApp.
 */
export async function sendWhatsAppMessage(phoneNumber, text) {
  if (!sock) throw new Error("WhatsApp no conectado");
  const jid = `${phoneNumber}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
  return true;
}

/**
 * Extrae texto de un mensaje de WhatsApp.
 */
function extractMessageContent(msg) {
  try {
    const type = getContentType(msg.message);
    if (!type) return null;
    const content = msg.message[type];
    if (!content) return null;
    if (content.text) return content.text;
    if (content.caption) return content.caption;
    if (content.listResponseMessage?.singleSelectReply?.selectedRowId) {
      return content.listResponseMessage.singleSelectReply.selectedRowId;
    }
    if (content.buttonsResponseMessage?.selectedButtonId) {
      return content.buttonsResponseMessage.selectedButtonId;
    }
    return null;
  } catch {
    return null;
  }
}
