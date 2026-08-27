/**
 * webchat-channel.mjs — Canal Web Chat multi-tenant
 *
 * Soporta /chat (Mototractor default) y /chat/:tenantSlug para multi-tenant.
 * Cada tenant tiene su propio branding y HTML.
 */

const _sessions = new Map();
let _bridgeCallback = null;

// Limpieza periódica de sesiones inactivas (> 1 hora)
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [key, session] of _sessions) {
    if (new Date(session.createdAt).getTime() < cutoff) {
      _sessions.delete(key);
    }
  }
}, 300000); // cada 5 minutos

export function onWebChatMessage(callback) {
  _bridgeCallback = callback;
}

/**
 * Renderiza HTML de chat para un tenant específico.
 */
function renderChatHTML(tenantConfig) {
  const primaryColor = tenantConfig?.branding?.primaryColor || "#2d5016";
  const companyName = tenantConfig?.branding?.companyName || "Mototractor";
  const tagline = tenantConfig?.branding?.tagline || "Soporte Técnico - Servicio al Cliente - Pre ventas - Ventas";
  const tenantName = tenantConfig?.branding?.companyName || "Mototractor";
  const badge = tenantName;
  const welcomeMsg = `<strong>¡Bienvenido!</strong> Soy el asistente CRM de ${tenantName}. Estoy aquí para ayudarte con soporte técnico, información de ventas y servicio al cliente. ¿En qué puedo ayudarte?`;
  const statusText = `Agente ${tenantName} CRM conectado · ${tagline}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${companyName} CRM</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .app { width: 100%; max-width: 500px; height: 100vh; max-height: 800px; display: flex; flex-direction: column; background: #1a1a1a; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.4); }
  .header { background: ${primaryColor}; padding: 1rem 1.2rem; display: flex; align-items: center; gap: 12px; }
  .header h1 { font-size: 1.1rem; font-weight: 600; }
  .header .badge { font-size: 0.7rem; background: #2ecc71; color: #000; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .header .sub { font-size: 0.75rem; color: #8ab4f8; margin-top: 2px; }
  .login-box { padding: 1.2rem; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid #2a2a2a; }
  .login-box input { background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 0.9rem; outline: none; transition: border 0.2s; }
  .login-box input:focus { border-color: #1e3a5f; }
  .login-box .btn-start { background: #2ecc71; color: #000; border: none; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
  .login-box .btn-start:disabled { opacity: 0.5; cursor: not-allowed; }
  .chat-area { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 10px; }
  .chat-area .empty { text-align: center; color: #555; margin-top: 40%; font-size: 0.9rem; }
  .msg { max-width: 85%; padding: 10px 14px; border-radius: 14px; font-size: 0.9rem; line-height: 1.4; animation: fadeIn 0.3s ease; }
  .msg.customer { align-self: flex-end; background: #2ecc71; color: #000; border-bottom-right-radius: 4px; }
  .msg.ai { align-self: flex-start; background: #2a2a2a; color: #e0e0e0; border-bottom-left-radius: 4px; }
  .msg .time { font-size: 0.65rem; opacity: 0.6; margin-top: 4px; text-align: right; }
  .msg.ai .time { text-align: left; }
  .input-area { padding: 1rem; border-top: 1px solid #2a2a2a; display: flex; gap: 8px; }
  .input-area input { flex: 1; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 20px; padding: 10px 16px; color: #fff; font-size: 0.9rem; outline: none; }
  .input-area input:focus { border-color: ${primaryColor}; }
  .input-area button { background: ${primaryColor}; color: #000; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; }
  .input-area button:disabled { opacity: 0.4; cursor: not-allowed; }
  .typing { align-self: flex-start; background: #2a2a2a; padding: 10px 16px; border-radius: 14px; display: flex; gap: 4px; }
  .typing span { width: 6px; height: 6px; background: #888; border-radius: 50%; animation: bounce 1.4s infinite; }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes bounce { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 2px; }
  .status-bar { display: flex; align-items: center; gap: 6px; padding: 6px 1.2rem; background: #151515; font-size: 0.7rem; color: #666; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #2ecc71; }
  .msg.ai table { width: 100%; border-collapse: collapse; margin: 2px 0; border-radius: 8px; overflow: hidden; font-size: 0.85rem; border: 1px solid #333; }
  .msg.ai th { background: #333; color: #e0e0e0; padding: 8px 12px; text-align: left; font-weight: 600; }
  .msg.ai td { padding: 8px 12px; border-bottom: 1px solid #2a2a2a; }
  .msg.ai tr:nth-child(even) td { background: #222; }
  .msg.ai tr:nth-child(odd) td { background: #1a1a1a; }
</style>
</head>
<body>
<div class="app" id="app">
  <div class="header">
    <div>
      <h1>🏗️ ${companyName}</h1>
      <div class="sub">${tagline}</div>
    </div>
    <span class="badge">● ${badge}</span>
  </div>

  <div class="login-box" id="loginBox">
    <input id="nameInput" placeholder="Tu nombre" value="Carlos">
    <input id="phoneInput" placeholder="Teléfono (opcional)" value="573001234567">
    <button class="btn-start" id="startBtn">Iniciar conversación</button>
  </div>

  <div class="status-bar"><span class="status-dot"></span> ${statusText}</div>
  <div class="chat-area" id="chatArea">
    <div class="empty">👋 Presiona "Iniciar conversación" para empezar</div>
  </div>

  <div class="input-area" id="inputArea" style="display:none">
    <input id="msgInput" placeholder="Escribe tu mensaje..." autocomplete="off">
    <button id="sendBtn">➤</button>
  </div>
</div>

<script>
const chatArea = document.getElementById('chatArea');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const loginBox = document.getElementById('loginBox');
const startBtn = document.getElementById('startBtn');
const nameInput = document.getElementById('nameInput');
const phoneInput = document.getElementById('phoneInput');
const inputArea = document.getElementById('inputArea');

let sessionPhone = '';
const tenantSlug = '${tenantConfig?.slug || ''}';

function addMessage(text, role) {
  const empty = chatArea.querySelector('.empty');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = text.replace(/\\n/g, '<br>') + '<div class="time">' + time + '</div>';
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

async function sendMessage(text) {
  msgInput.disabled = true;
  sendBtn.disabled = true;
  addMessage(text, 'customer');
  showTyping();

  try {
    const body = { name: nameInput.value || 'Carlos', phone: sessionPhone, text };
    if (tenantSlug) body.tenant = tenantSlug;
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    hideTyping();
    addMessage(data.reply, 'ai');
  } catch(e) {
    hideTyping();
    addMessage('⚠️ Error de conexión', 'ai');
  }

  msgInput.disabled = false;
  sendBtn.disabled = false;
  msgInput.focus();
}

startBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Carlos';
  const phone = phoneInput.value.trim() || 'chat-' + Date.now();
  sessionPhone = phone;

  loginBox.style.display = 'none';
  inputArea.style.display = 'flex';

  addMessage('${welcomeMsg.replace(/'/g, "\\'")}', 'ai');
  msgInput.focus();
});

sendBtn.addEventListener('click', () => {
  const text = msgInput.value.trim();
  if (!text) return;
  msgInput.value = '';
  sendMessage(text);
});

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});
</script>
</body>
</html>`;
}

/**
 * Registra rutas webchat en una app Express.
 */
export function registerWebChat(app, rateLimiter) {
  // ── Multi-tenant: /chat/:tenantSlug ──
  app.get("/chat/:tenantSlug", async (req, res) => {
    const { TenantStore } = await import("../stores/tenant-store.mjs");
    const ts = TenantStore.getInstance();
    const tenant = await ts.findBySlug(req.params.tenantSlug);
    if (tenant) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.type("html").send(renderChatHTML(tenant));
    }
    // Fallback: unknown slug → default
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.type("html").send(renderChatHTML(null));
  });

  // ── Default: Mototractor ──
  app.get("/chat", (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.type("html").send(renderChatHTML(null));
  });

  // ── API: enviar mensaje (multi-tenant, rate-limited: 20/min por sesión) ──
  const chatLimiter = rateLimiter || ((req, res, next) => next());
  app.post("/api/chat", chatLimiter, async (req, res) => {
    const { name, phone, text, tenant } = req.body || {};
    if (!text) return res.status(400).json({ error: "text requerido" });

    const senderId = phone || `anon-${Date.now()}`;
    const senderName = name || "Visitante";

    // Guardar sesión
    if (!_sessions.has(senderId)) {
      _sessions.set(senderId, { name: senderName, phone, tenant, createdAt: new Date().toISOString() });
    }

    if (!_bridgeCallback) {
      return res.json({ reply: "⚠️ El agente CRM no está disponible ahora." });
    }

    try {
      const result = await _bridgeCallback({
        channel: "webchat",
        senderId,
        senderName,
        text,
        tenant,  // ← multi-tenant: el bridge resuelve el tenant
        raw: null,
      });
      res.json({ reply: result.answer || "✓ Recibido" });
    } catch (err) {
      res.json({ reply: "⚠️ Lo siento, ocurrió un error. Un agente te atenderá pronto." });
    }
  });

  // ── API: historial de sesión ──
  app.get("/api/chat/history/:phone", async (req, res) => {
    const { ConversationStore } = await import("../stores/conversation-store.mjs");
    const { ContactStore } = await import("../stores/contact-store.mjs");
    const contact = await ContactStore.getInstance().findByPhone(req.params.phone);
    if (!contact) return res.json({ messages: [] });
    const convs = await ConversationStore.getInstance().findByContact(contact.id);
    const active = convs.find(c => c.status === "active");
    res.json({ messages: active?.messages || [] });
  });
}
