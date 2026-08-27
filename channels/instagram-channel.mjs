/**
 * instagram-channel.mjs — Canal Instagram via Instagram Graph API
 *
 * Usa la Instagram Graph API con webhook para recibir mensajes.
 * Requiere: Instagram Business Account + Facebook App configurado.
 *
 * Modo desarrollo: simulador que muestra cómo conectar.
 * Modo producción: Express endpoint para webhook de Meta.
 *
 * Uso: import { startInstagram } from "./instagram-channel.mjs";
 */

import "dotenv/config";

const CFG = {
  enabled: process.env.INSTAGRAM_ENABLED === "true",
  verifyToken: process.env.INSTAGRAM_VERIFY_TOKEN || "crm-verify-token-2024",
  accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || "",
  businessId: process.env.INSTAGRAM_BUSINESS_ID || "",
  appSecret: process.env.INSTAGRAM_APP_SECRET || "",
  webhookPath: "/webhook/instagram",
};

let onMessageCallback = null;
let _isReady = false;

/**
 * Registra callback para mensajes entrantes.
 */
export function onInstagramMessage(callback) {
  onMessageCallback = callback;
}

/**
 * Obtiene el manejador Express para el webhook de Instagram.
 */
export function getInstagramWebhookHandler() {
  return {
    path: CFG.webhookPath,
    // GET = Verification webhook (Meta requiere esto)
    async verify(req, res) {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === CFG.verifyToken) {
        console.log("✅ Instagram Webhook verificado!");
        _isReady = true;
        return res.status(200).send(challenge);
      }
      return res.status(403).send("Verification failed");
    },
    // POST = Mensajes entrantes
    async handleMessage(req, res) {
      const body = req.body;

      // Responder inmediatamente a Meta (timeout de 20s)
      res.status(200).send("EVENT_RECEIVED");

      // Verificar que es un mensaje de Instagram
      if (!body?.entry?.[0]?.messaging) return;

      for (const entry of body.entry) {
        for (const event of entry.messaging) {
          // Sólo mensajes de texto por ahora
          if (!event.message?.text) continue;

          const senderId = event.sender?.id;
          const text = event.message.text;

          console.log(`📩 Instagram [${senderId}]: ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`);

          if (onMessageCallback) {
            try {
              await onMessageCallback({
                channel: "instagram",
                senderId,
                senderName: senderId, // Graph API no da pushName en webhook
                text,
                raw: event,
              });
            } catch (err) {
              console.error("❌ Error en callback Instagram:", err.message);
            }
          }
        }
      }
    },
    // Mostrar configuración necesaria
    get configInfo() {
      return {
        webhookUrl: `https://TU_DOMINIO${CFG.webhookPath}`,
        verifyToken: CFG.verifyToken,
        requiredSetup: [
          "1. Crear Facebook App en https://developers.facebook.com",
          "2. Añadir producto Instagram Graph API",
          "3. Configurar Webhook con la URL y Verify Token de arriba",
          "4. Suscribirse al webhook desde la app",
          "5. Configurar estas vars de entorno:",
          "   INSTAGRAM_ENABLED=true",
          "   INSTAGRAM_ACCESS_TOKEN=tu_token",
          "   INSTAGRAM_BUSINESS_ID=tu_business_id",
          "   INSTAGRAM_APP_SECRET=tu_app_secret",
        ],
      };
    },
  };
}

/**
 * Envía un mensaje a Instagram.
 * NOTA: Instagram Graph API requiere aprobación del usuario en modo producción.
 */
export async function sendInstagramMessage(recipientId, text) {
  if (!CFG.accessToken) {
    console.warn("⚠️  Instagram: No access token configurado");
    return false;
  }

  try {
    const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${CFG.accessToken}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error("❌ Instagram send error:", err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("❌ Instagram send error:", err.message);
    return false;
  }
}

export function getInstagramStatus() {
  return {
    configured: CFG.enabled,
    verified: _isReady,
    businessId: CFG.businessId || "(no configurado)",
    webhookPath: CFG.webhookPath,
  };
}
