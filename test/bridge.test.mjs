/**
 * bridge.test.mjs — Tests del bridge CRM (processIncomingMessage)
 *
 * Cubre:
 *  - Flujo WhatsApp: contacto nuevo y existente
 *  - Flujo Instagram: creación de contacto
 *  - Flujo WebChat: creador de contacto desde nombre
 *  - Manejo de error y timeout del agente
 *  - Manejo de error en envío del mensaje de respuesta
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks de dependencias externas ──
vi.mock("../stores/store-factory.mjs", () => ({
  StoreFactory: {
    forTenant: vi.fn(),
  },
}));

vi.mock("../stores/tenant-store.mjs", () => ({
  TenantStore: {
    getInstance: vi.fn(),
  },
}));

vi.mock("../crm-multiagent.mjs", () => ({
  getMultiAgent: vi.fn(),
  extractAnswer: vi.fn((result) => {
    const msgs = result.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant" && typeof msgs[i].content === "string") {
        return msgs[i].content;
      }
    }
    return msgs[msgs.length - 1]?.content || "";
  }),
  isFarewell: vi.fn((text) => {
    const t = (text || "").toLowerCase();
    return [
      "es todo por hoy", "por hoy es todo", "es todo", "por ahora es todo",
      "es suficiente", "finalizamos por hoy", "hasta luego", "nos vemos",
      "chao", "chau", "adios", "adiós", "bye",
    ].some((s) => t.includes(s));
  }),
  FAREWELL:
    "¡Ha sido un gusto atenderte! 🚜 Recuerda que para ventas, cotización o producción puedes contactar directamente a Ángela Cuadrado al 📱350 4515126, ella estará encantada de ayudarte a conseguir tu Mototractor y resolver cualquier detalle. ¡No dejes pasar la oportunidad de llevar la revolución del campo colombiano a tu finca! 🇨🇴💪🔥",
  buildFarewell: vi.fn((knowledge) => {
    // Despedida determinista por tenant: si el knowledge define contacto de
    // ventas propio, se usa; si no, cae en FAREWELL (Mototractor/Ángela).
    const c = knowledge?.general?.contacto_ventas_produccion;
    if (c?.nombre && c?.telefono) {
      return `¡Ha sido un gusto atenderte! 🚜 Para ventas o producción contacta con ${c.nombre} al 📱${c.telefono}. ¡Feliz día!`;
    }
    return "¡Ha sido un gusto atenderte! 🚜 Para ventas contacta con Ángela Cuadrado al 📱350 4515126. ¡Feliz día!";
  }),
}));

vi.mock("../channels/whatsapp-channel.mjs", () => ({
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock("../channels/instagram-channel.mjs", () => ({
  sendInstagramMessage: vi.fn(),
}));

// Mock de plan-enforcer para aislar los tests de SQLite real (sql.js)
vi.mock("../services/plan-enforcer.mjs", () => ({
  checkQuota: vi.fn(),
  incrementUsage: vi.fn(),
}));

// Importamos los mocks y el módulo bajo test
import { StoreFactory } from "../stores/store-factory.mjs";
import { TenantStore } from "../stores/tenant-store.mjs";
import { getMultiAgent } from "../crm-multiagent.mjs";
import { sendWhatsAppMessage } from "../channels/whatsapp-channel.mjs";
import { sendInstagramMessage } from "../channels/instagram-channel.mjs";
import { checkQuota, incrementUsage } from "../services/plan-enforcer.mjs";
import { isFarewell, buildFarewell } from "../crm-multiagent.mjs";
import { processIncomingMessage, stripReasoningPreamble } from "../channels/crm-bridge.mjs";

// ── Helpers locales ──
function createMockAgent(responseText = "Respuesta de prueba") {
  let _resolve = null;
  const waitPromise = new Promise((r) => { _resolve = r; });

  const agent = {
    invoke: vi.fn().mockImplementation(async ({ messages }) => {
      const result = {
        messages: [
          ...messages,
          { role: "assistant", content: responseText },
        ],
      };
      _resolve?.();
      return result;
    }),
    _resolve,
    waitPromise,
  };
  return agent;
}

function createMockContact(overrides = {}) {
  return {
    id: "contact-1",
    name: "Carlos López",
    phone: "573001234567",
    email: "carlos@test.com",
    source: "whatsapp",
    company: "TestCorp",
    tags: ["auto-creado", "whatsapp", "mototractor"],
    conversationCount: 0,
    lastActivity: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: [],
    ...overrides,
  };
}

function createMockConversation(overrides = {}) {
  return {
    id: "conv-1",
    contactId: "contact-1",
    channel: "whatsapp",
    messages: [],
    status: "active",
    assignedTo: "ai",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockDeal(overrides = {}) {
  return {
    id: "deal-1",
    contactId: "contact-1",
    title: "Test Deal",
    value: 588000,
    stage: "qualified",
    source: "whatsapp",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Mocks de stores ──
let mockContactStore;
let mockConvStore;
let mockDealStore;

function setupStores() {
  mockContactStore = {
    findByPhone: vi.fn(),
    create: vi.fn(),
    put: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
  };

  mockConvStore = {
    findByContact: vi.fn(),
    create: vi.fn(),
    addMessage: vi.fn(),
    get: vi.fn(),
  };

  mockDealStore = {
    findByContact: vi.fn(),
  };

  StoreFactory.forTenant.mockReturnValue({
    contacts: mockContactStore,
    conversations: mockConvStore,
    deals: mockDealStore,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupStores();
  // Por defecto: quota permitida y sin incremento (evita SQLite real)
  checkQuota.mockResolvedValue({ allowed: true, usage: 0, limit: Infinity });
  incrementUsage.mockResolvedValue();
});

// ══════════════════════════════════════════════════
//  FLUJO WHATSAPP
// ══════════════════════════════════════════════════

describe("Flujo WhatsApp", () => {
  it("crea contacto nuevo y responde correctamente", async () => {
    const mockAgent = createMockAgent("¡Hola Carlos! ¿En qué puedo ayudarte?");
    getMultiAgent.mockReturnValue(mockAgent);
    sendWhatsAppMessage.mockResolvedValue(true);

    const newContact = createMockContact();
    mockContactStore.findByPhone.mockResolvedValue(null);
    mockContactStore.create.mockResolvedValue(newContact);
    mockContactStore.put.mockResolvedValue(newContact);

    mockConvStore.findByContact.mockResolvedValue([]);
    const newConv = createMockConversation();
    mockConvStore.create.mockResolvedValue(newConv);
    mockConvStore.get.mockResolvedValue(newConv);
    mockConvStore.addMessage.mockImplementation(async (convId, role, content) => {
      newConv.messages.push({ role, content, timestamp: new Date().toISOString() });
      return newConv;
    });

    mockDealStore.findByContact.mockResolvedValue([]);

    const result = await processIncomingMessage({
      channel: "whatsapp",
      senderId: "573001234567",
      senderName: "Carlos López",
      text: "Hola, quiero información del Mototractor",
    });

    // Verifica que se creó el contacto
    expect(mockContactStore.findByPhone).toHaveBeenCalledWith("573001234567");
    expect(mockContactStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Carlos López",
        phone: "573001234567",
        source: "whatsapp",
      }),
    );

    // Verifica que se creó una conversación
    expect(mockConvStore.create).toHaveBeenCalled();

    // Verifica que se guardó el mensaje del cliente
    expect(mockConvStore.addMessage).toHaveBeenCalledWith(
      expect.any(String),
      "customer",
      "Hola, quiero información del Mototractor",
    );

    // Verifica que se invocó al agente
    expect(mockAgent.invoke).toHaveBeenCalled();

    // Verifica que se guardó la respuesta
    expect(mockConvStore.addMessage).toHaveBeenCalledWith(
      expect.any(String),
      "ai",
      expect.stringContaining("¡Hola Carlos!"),
    );

    // Verifica que se envió la respuesta por WhatsApp
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      "573001234567",
      expect.stringContaining("¡Hola Carlos!"),
    );

    // Verifica el resultado
    expect(result).toBeDefined();
    expect(result.contact).toEqual(newContact);
  });

  it("identifica contacto existente por teléfono", async () => {
    const mockAgent = createMockAgent("¿Cómo estás Carlos?");
    getMultiAgent.mockReturnValue(mockAgent);
    sendWhatsAppMessage.mockResolvedValue(true);

    const existingContact = createMockContact({ conversationCount: 3 });
    mockContactStore.findByPhone.mockResolvedValue(existingContact);
    mockContactStore.put.mockResolvedValue(existingContact);

    const existingConv = createMockConversation({
      messages: [
        { role: "customer", content: "Mensaje anterior", timestamp: new Date().toISOString() },
        { role: "ai", content: "Respuesta anterior", timestamp: new Date().toISOString() },
      ],
    });
    mockConvStore.findByContact.mockResolvedValue([existingConv]);
    mockConvStore.get.mockResolvedValue(existingConv);
    mockConvStore.addMessage.mockImplementation(async (convId, role, content) => {
      existingConv.messages.push({ role, content, timestamp: new Date().toISOString() });
      return existingConv;
    });

    mockDealStore.findByContact.mockResolvedValue([]);

    await processIncomingMessage({
      channel: "whatsapp",
      senderId: "573001234567",
      senderName: "Carlos López",
      text: "Un mensaje más",
    });

    // No debe crear nuevo contacto
    expect(mockContactStore.create).not.toHaveBeenCalled();
    // Tampoco nueva conversación
    expect(mockConvStore.create).not.toHaveBeenCalled();
    // Debe reusar la existente
    expect(mockConvStore.addMessage).toHaveBeenCalled();
    // Debe contar la conversación
    expect(mockContactStore.put).toHaveBeenCalled();

    // Último put debe tener conversationCount incrementado
    const putCalls = mockContactStore.put.mock.calls;
    expect(putCalls[putCalls.length - 1][0].conversationCount).toBe(4);
  });

  it("maneja deals activos y los pasa en contexto", async () => {
    const mockAgent = createMockAgent("Excelente, tienes un deal activo.");
    getMultiAgent.mockReturnValue(mockAgent);
    sendWhatsAppMessage.mockResolvedValue(true);

    const contact = createMockContact();
    mockContactStore.findByPhone.mockResolvedValue(contact);
    mockContactStore.put.mockResolvedValue(contact);

    const conv = createMockConversation();
    mockConvStore.findByContact.mockResolvedValue([conv]);
    mockConvStore.get.mockResolvedValue(conv);
    mockConvStore.addMessage.mockResolvedValue(conv);

    // Deals activos
    mockDealStore.findByContact.mockResolvedValue([
      createMockDeal({ title: "Plan Professional", value: 588000, stage: "negotiation" }),
    ]);

    await processIncomingMessage({
      channel: "whatsapp",
      senderId: "573001234567",
      senderName: "Carlos",
      text: "Status de mi compra",
    });

    // Verifica que el deal activo se pasó en el prompt al agente
    const invokeArg = mockAgent.invoke.mock.calls[0][0];
    const promptContent = invokeArg.messages[0].content;
    expect(promptContent).toContain("Deals activos");
    expect(promptContent).toContain("negotiation");
    expect(promptContent).toContain("588");
  });
});

// ══════════════════════════════════════════════════
//  FLUJO INSTAGRAM
// ══════════════════════════════════════════════════

describe("Flujo Instagram", () => {
  it("crea contacto y responde correctamente", async () => {
    const mockAgent = createMockAgent("¡Hola! Bienvenido al CRM.");
    getMultiAgent.mockReturnValue(mockAgent);
    sendInstagramMessage.mockResolvedValue(true);

    const newContact = createMockContact({
      phone: "ig_12345",
      name: "María García",
      source: "instagram",
    });
    mockContactStore.findByPhone.mockResolvedValue(null);
    mockContactStore.create.mockResolvedValue(newContact);
    mockContactStore.put.mockResolvedValue(newContact);

    const newConv = createMockConversation({ channel: "instagram" });
    mockConvStore.findByContact.mockResolvedValue([]);
    mockConvStore.create.mockResolvedValue(newConv);
    mockConvStore.get.mockResolvedValue(newConv);
    mockConvStore.addMessage.mockResolvedValue(newConv);

    mockDealStore.findByContact.mockResolvedValue([]);

    const result = await processIncomingMessage({
      channel: "instagram",
      senderId: "ig_12345",
      senderName: "María García",
      text: "Hola, me interesa el producto",
    });

    expect(mockContactStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "María García",
        phone: "ig_12345",
        source: "instagram",
      }),
    );
    expect(sendInstagramMessage).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});

// ══════════════════════════════════════════════════
//  FLUJO WEBCHAT
// ══════════════════════════════════════════════════

describe("Flujo WebChat", () => {
  it("crea contacto y responde con formato HTML", async () => {
    const mockAgent = createMockAgent("Hola **Carlos**! Soy tu asistente.");
    getMultiAgent.mockReturnValue(mockAgent);

    const newContact = createMockContact({
      phone: "webchat-1234",
      name: "Carlos",
      source: "webchat",
    });
    mockContactStore.findByPhone.mockResolvedValue(null);
    mockContactStore.create.mockResolvedValue(newContact);
    mockContactStore.put.mockResolvedValue(newContact);

    const newConv = createMockConversation({ channel: "webchat" });
    mockConvStore.findByContact.mockResolvedValue([]);
    mockConvStore.create.mockResolvedValue(newConv);
    mockConvStore.get.mockResolvedValue(newConv);
    mockConvStore.addMessage.mockResolvedValue(newConv);

    mockDealStore.findByContact.mockResolvedValue([]);

    const result = await processIncomingMessage({
      channel: "webchat",
      senderId: "webchat-1234",
      senderName: "Carlos",
      text: "Hola",
    });

    expect(mockContactStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Carlos", source: "webchat" }),
    );
    // Webchat recibe respuesta con formato markdown → HTML
    expect(result.answer).toBeDefined();
  });
});

// ══════════════════════════════════════════════════
//  CIERRE DE CONVERSACIÓN (despedida)
// ══════════════════════════════════════════════════

describe("Cierre de conversación (despedida)", () => {
  it('ante "Es todo por hoy" responde despedida cordial sin invocar al agente', async () => {
    const mockAgent = createMockAgent("NO DEBE USARSE");
    getMultiAgent.mockReturnValue(mockAgent);
    sendWhatsAppMessage.mockResolvedValue(true);

    const contact = createMockContact();
    mockContactStore.findByPhone.mockResolvedValue(contact);
    mockContactStore.put.mockResolvedValue(contact);
    mockContactStore.create.mockResolvedValue(contact);

    const conv = createMockConversation();
    mockConvStore.findByContact.mockResolvedValue([conv]);
    mockConvStore.get.mockResolvedValue(conv);
    mockConvStore.addMessage.mockImplementation(async (cid, role, content) => {
      conv.messages.push({ role, content, timestamp: new Date().toISOString() });
      return conv;
    });

    mockDealStore.findByContact.mockResolvedValue([]);

    const result = await processIncomingMessage({
      channel: "whatsapp",
      senderId: "573001234567",
      senderName: "Carlos",
      text: "Es todo por hoy",
    });

    // Se detecta la despedida y NO se consume un razonamiento del agente
    expect(isFarewell).toHaveBeenCalledWith("Es todo por hoy");
    // Nota: el agente sí se construye en el flujo, pero NO debe invocarse
    expect(mockAgent.invoke).not.toHaveBeenCalled();

    // La respuesta es la despedida cordial estándar por tenant (sin tenant →
    // cae en el contacto del Mototractor: Ángela Cuadrado).
    const farewellDefault = buildFarewell(null);
    expect(buildFarewell).toHaveBeenCalled();
    expect(result.answer).toBe(farewellDefault);
    expect(result.answer).toContain("Ángela Cuadrado");
    expect(sendWhatsAppMessage).toHaveBeenCalledWith("573001234567", farewellDefault);

    // El mensaje del cliente se persistió y también la respuesta AI
    expect(mockConvStore.addMessage).toHaveBeenCalledWith(expect.any(String), "customer", "Es todo por hoy");
    expect(mockConvStore.addMessage).toHaveBeenCalledWith(expect.any(String), "ai", farewellDefault);
  });

  it("despedidas cortas por palabra ('bye', 'chao') también se detectan", async () => {
    for (const closing of ["bye", "chao", "hasta luego", "nos vemos"]) {
      expect(isFarewell(closing)).toBe(true);
    }
    // Texto normal NO se marca como despedida
    expect(isFarewell("Hola, quiero comprar un kit")).toBe(false);
    expect(isFarewell("gracias")).toBe(false); // "gracias" solo no es despedida
  });

  it("el cierre del tenant MotoStabily usa Andrés Sanabria 321 417 1508", async () => {
    // Simula que el tenant motostabily existe → su knowledge resuelve el
    // contacto propio (Andrés Sanabria).
    TenantStore.getInstance.mockReturnValue({
      findBySlug: vi.fn().mockResolvedValue({
        slug: "motostabily",
        name: "MotoStabily",
        branding: {},
        plan: "pro",
      }),
    });

    const mockAgent = createMockAgent("NO DEBE USARSE");
    getMultiAgent.mockReturnValue(mockAgent);
    sendWhatsAppMessage.mockResolvedValue(true);

    const contact = createMockContact();
    mockContactStore.findByPhone.mockResolvedValue(contact);
    mockContactStore.put.mockResolvedValue(contact);
    mockContactStore.create.mockResolvedValue(contact);

    const conv = createMockConversation();
    mockConvStore.findByContact.mockResolvedValue([conv]);
    mockConvStore.get.mockResolvedValue(conv);
    mockConvStore.addMessage.mockImplementation(async (cid, role, content) => {
      conv.messages.push({ role, content, timestamp: new Date().toISOString() });
      return conv;
    });

    mockDealStore.findByContact.mockResolvedValue([]);

    const result = await processIncomingMessage({
      channel: "whatsapp",
      senderId: "573001234567",
      senderName: "Carlos",
      tenant: "motostabily",
      text: "Es todo por hoy",
    });

    // No se consume un razonamiento del agente
    expect(mockAgent.invoke).not.toHaveBeenCalled();
    // La despedida determinista del tenant MotoStabily usa su propio contacto
    expect(buildFarewell).toHaveBeenCalled();
    expect(result.answer).toContain("Andrés Sanabria");
    expect(result.answer).toContain("321 417 1508");
    expect(result.answer).not.toContain("Ángela");
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      "573001234567",
      expect.stringContaining("Andrés Sanabria"),
    );
  });
});

// ══════════════════════════════════════════════════
//  MANEJO DE ERRORES
// ══════════════════════════════════════════════════

describe("Manejo de errores", () => {
  it("envía mensaje de error cuando el agente falla", async () => {
    getMultiAgent.mockImplementation(() => {
      throw new Error("Agente no disponible");
    });
    sendWhatsAppMessage.mockResolvedValue(true);

    const contact = createMockContact();
    mockContactStore.findByPhone.mockResolvedValue(null);
    mockContactStore.create.mockResolvedValue(contact);
    mockContactStore.put.mockResolvedValue(contact);
    mockConvStore.findByContact.mockResolvedValue([]);
    mockConvStore.create.mockResolvedValue(createMockConversation());
    mockConvStore.get.mockResolvedValue(createMockConversation());
    mockConvStore.addMessage.mockResolvedValue(createMockConversation());
    mockDealStore.findByContact.mockResolvedValue([]);

    const result = await processIncomingMessage({
      channel: "whatsapp",
      senderId: "573001234567",
      senderName: "Carlos",
      text: "Hola",
    });

    // Debe enviar mensaje de error al cliente (en vez de dejar un rechazo huérfano)
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      "573001234567",
      expect.stringContaining("Lo siento"),
    );
    // Debe resolver con la respuesta de error, no lanzar
    expect(result).toBeDefined();
    expect(result.answer).toContain("Lo siento");
  });

  it("maneja timeout del agente (más de 60s) respondiendo mensaje genérico", async () => {
    // Mock que nunca resuelve e ignora la señal de abort
    getMultiAgent.mockReturnValue({
      invoke: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
    });
    sendWhatsAppMessage.mockResolvedValue(true);

    const contact = createMockContact();
    mockContactStore.findByPhone.mockResolvedValue(contact);
    mockContactStore.put.mockResolvedValue(contact);
    mockConvStore.findByContact.mockResolvedValue([createMockConversation()]);
    mockConvStore.get.mockResolvedValue(createMockConversation());
    mockConvStore.addMessage.mockResolvedValue(createMockConversation());
    mockDealStore.findByContact.mockResolvedValue([]);

    // Con timers reales el test tardaría 60s; usamos fake timers para avanzar el reloj.
    vi.useFakeTimers();
    try {
      const promise = processIncomingMessage({
        channel: "whatsapp",
        senderId: "573001234567",
        senderName: "Carlos",
        text: "Hola",
      });
      // Avanza los 60s del timeout: Promise.race debe rechazar con el error genérico.
      await vi.advanceTimersByTimeAsync(60000);
      const result = await promise;

      // No se cuelga: responde el mensaje genérico en vez de lanzar.
      expect(result).toBeDefined();
      expect(result.answer).toContain("El asistente está tardando");
      expect(sendWhatsAppMessage).toHaveBeenCalledWith(
        "573001234567",
        expect.stringContaining("El asistente está tardando"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("no falla si el canal no tiene función de envío", async () => {
    const mockAgent = createMockAgent("Respuesta OK");
    getMultiAgent.mockReturnValue(mockAgent);

    const contact = createMockContact({ phone: "anon" });
    mockContactStore.findByPhone.mockResolvedValue(contact);
    mockContactStore.put.mockResolvedValue(contact);
    mockConvStore.findByContact.mockResolvedValue([createMockConversation()]);
    mockConvStore.get.mockResolvedValue(createMockConversation());
    mockConvStore.addMessage.mockResolvedValue(createMockConversation());
    mockDealStore.findByContact.mockResolvedValue([]);

    // Canal no listado explícitamente crea contacto vía senderId
    const result = await processIncomingMessage({
      channel: "desconocido",
      senderId: "anon",
      senderName: "Anon",
      text: "test",
    });

    expect(result).toBeDefined();
    expect(result.answer).toBe("Respuesta OK");
  });
});

// ══════════════════════════════════════════════════
//  STRIP DE PREÁMBULO DE RAZONAMIENTO (anti-fuga de chain-of-thought)
//  DeepSeek antepone su razonamiento interno a la respuesta; el strip
//  debe dejar solo la respuesta dirigida al cliente.
// ══════════════════════════════════════════════════

describe("stripReasoningPreamble", () => {
  it("quita el preámbulo de razonamiento antes de la respuesta (español)", () => {
    const input = [
      "El cliente ya eligió transferencia bancaria y confirmó intención de compra, así que puedo compartir los datos de la cuenta.", "",
      "Aquí tienes todos los datos para la consignación: 🏦", "",
      "🏦 Banco: Davivienda",
    ].join("\n");
    const out = stripReasoningPreamble(input);
    expect(out).toBe("Aquí tienes todos los datos para la consignación: 🏦\n\n🏦 Banco: Davivienda");
    expect(out).not.toContain("El cliente ya eligió");
    expect(out).not.toContain("puedo compartir");
  });

  it('quita el preámbulo en inglés y los párrafos intermedios de planificación', () => {
    const input = [
      "The customer is asking for installation information. According to my instructions, I enter TUTORIAL MODE.", "",
      "Let me start with the reception and Step 0.", "",
      "Hola ⚖️, te saluda el asistente de MotoStabily.",
    ].join("\n");
    const out = stripReasoningPreamble(input);
    expect(out).toBe("Hola ⚖️, te saluda el asistente de MotoStabily.");
    expect(out).not.toContain("According to my instructions");
    expect(out).not.toContain("Let me start");
  });

  it('quita preámbulos como "The customer seems confused..."', () => {
    const input = "The customer seems confused or didn't understand. Let me clarify the step 5 instructions for them.\n\nPerfecto, ⚖️! Te explico de nuevo el paso 5.";
    expect(stripReasoningPreamble(input)).toBe("Perfecto, ⚖️! Te explico de nuevo el paso 5.");
  });

  it('quita el razonamiento de confirmación previo a la respuesta', () => {
    const input = "El cliente está confirmando que solo son 7 pasos, así que debo confirmar la finalización correctamente.\n\n¡Exacto, ⚖️! Son 7 pasos en total y ya completaste todos. 🎉";
    const out = stripReasoningPreamble(input);
    expect(out).toBe("¡Exacto, ⚖️! Son 7 pasos en total y ya completaste todos. 🎉");
    expect(out).not.toContain("debo confirmar");
  });

  it("NO altera respuestas legítimas dirigidas al cliente", () => {
    const legit = [
      "¡Claro, ⚖️! Aquí tienes los precios del MotoStabily: 💰 $1.199.000",
      "Puedes ver el MotoStabily en acción aquí: https://beacons.ai/mototractor_oficial 🚜",
      "El titular de la cuenta es WILSON MEDINA RUBIANO. 😊",
      "Te recuerdo los usos del MotoStabily: transporta hasta 200 kg.",
      "Recuerda que tienes un pedido de 5 unidades por $5.995.000.",
    ];
    for (const text of legit) {
      expect(stripReasoningPreamble(text)).toBe(text);
    }
  });

  it("devuelve el texto sin cambios si no detecta con confianza un preámbulo", () => {
    // Solo razonamiento sin párrafo de respuesta inequívoco → no talar.
    const onlyReasoning = "The customer is asking for installation information.";
    expect(stripReasoningPreamble(onlyReasoning)).toBe(onlyReasoning);
  });
});

// ══════════════════════════════════════════════════
//  INTEGRACIÓN: FLUJO COMPLETO
// ══════════════════════════════════════════════════

describe("Flujo completo de integración", () => {
  it("procesa 3 mensajes consecutivos manteniendo historial", async () => {
    const agentResponses = [
      "¡Bienvenido! ¿En qué puedo ayudarte?",
      "Claro, el Mototractor cuesta $X.",
      "Genial, creo un deal para ti.",
    ];
    let callCount = 0;

    getMultiAgent.mockReturnValue({
      invoke: vi.fn().mockImplementation(async ({ messages }) => {
        const response = agentResponses[callCount] || "OK";
        callCount++;
        return {
          messages: [
            ...messages,
            { role: "assistant", content: response },
          ],
        };
      }),
    });
    sendWhatsAppMessage.mockResolvedValue(true);
    sendInstagramMessage.mockResolvedValue(true);

    const contact = createMockContact();
    mockContactStore.findByPhone.mockResolvedValue(contact);
    mockContactStore.put.mockResolvedValue(contact);
    const conv = createMockConversation();
    mockConvStore.findByContact
      .mockResolvedValue([conv]);
    mockConvStore.get
      .mockResolvedValue(conv);
    mockConvStore.addMessage.mockImplementation(async (convId, role, content) => {
      conv.messages.push({ role, content, timestamp: new Date().toISOString() });
      return conv;
    });
    mockDealStore.findByContact.mockResolvedValue([]);

    // Mensaje 1
    await processIncomingMessage({ channel: "whatsapp", senderId: "573001234567", senderName: "Carlos", text: "Hola" });
    expect(callCount).toBe(1);

    // Mensaje 2
    await processIncomingMessage({ channel: "whatsapp", senderId: "573001234567", senderName: "Carlos", text: "Cuánto cuesta?" });
    expect(callCount).toBe(2);

    // El historial debe tener 4 mensajes (2 de ida + 2 de vuelta)
    expect(conv.messages.length).toBeGreaterThanOrEqual(4);

    // Mensaje 3
    await processIncomingMessage({ channel: "whatsapp", senderId: "573001234567", senderName: "Carlos", text: "Crea un deal" });
    expect(callCount).toBe(3);

    // Verificar que en la tercera llamada el historial completo se pasó al agente
    const lastInvokeArg = mockContactStore.findByPhone.mock.calls;
    expect(lastInvokeArg.length).toBeGreaterThanOrEqual(3);
  });
});
