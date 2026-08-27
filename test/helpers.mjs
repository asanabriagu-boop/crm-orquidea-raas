/**
 * test/helpers.mjs — Helpers de testing para el CRM
 *
 * Proporciona stores en memoria y mocks para testear
 * el bridge, los canales y el servidor sin dependencias externas.
 */

// ── In-memory Map store (reemplaza BaseStore con JSON en disco) ──
export class MockStore {
  constructor() {
    this.items = new Map();
    this._loaded = true;
  }

  async load() { /* no-op */ }
  async save() { /* no-op */ }

  async getAll() {
    return Array.from(this.items.values());
  }

  async get(id) {
    return this.items.get(id) || null;
  }

  async put(item) {
    this.items.set(item.id, item);
    return item;
  }

  async delete(id) {
    return this.items.delete(id);
  }

  async find(fn) {
    return Array.from(this.items.values()).filter(fn);
  }

  async count() {
    return this.items.size;
  }
}

// ── ContactStore mock ──
export class MockContactStore extends MockStore {
  async create(data) {
    const { Contact } = await import("../models.mjs");
    const contact = new Contact({
      name: data.name || data.phone || "Test",
      phone: data.phone || "",
      email: data.email || "",
      source: data.source || "manual",
      company: data.company || "",
      tags: data.tags || [],
    });
    return this.put(contact.toJSON());
  }

  async findByPhone(phone) {
    await this.load();
    for (const c of this.items.values()) {
      if (c.phone === phone) return c;
    }
    return null;
  }

  async findByEmail(email) {
    await this.load();
    for (const c of this.items.values()) {
      if (c.email === email) return c;
    }
    return null;
  }

  async findBySource(source) {
    await this.load();
    return Array.from(this.items.values()).filter(c => c.source === source);
  }

  async search(query) {
    await this.load();
    const q = query.toLowerCase();
    return Array.from(this.items.values()).filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }
}

// ── DealStore mock ──
export class MockDealStore extends MockStore {
  async create(data) {
    const { Deal } = await import("../models.mjs");
    const deal = new Deal({
      contactId: data.contactId,
      title: data.title || "Test Deal",
      value: data.value || 0,
      stage: data.stage || "lead",
      source: data.source || "manual",
    });
    return this.put(deal.toJSON());
  }

  async findByContact(contactId) {
    return Array.from(this.items.values()).filter(d => d.contactId === contactId);
  }

  async findByStage(stage) {
    return Array.from(this.items.values()).filter(d => d.stage === stage);
  }

  async updateStage(id, newStage) {
    const deal = await this.get(id);
    if (!deal) return null;
    deal.stage = newStage;
    deal.updatedAt = new Date().toISOString();
    return this.put(deal);
  }

  async getPipelineSummary() {
    const stages = {};
    let totalValue = 0;
    for (const d of this.items.values()) {
      stages[d.stage] = (stages[d.stage] || 0) + 1;
      totalValue += d.value;
    }
    return { stages, totalDeals: this.items.size, totalValue };
  }
}

// ── ConversationStore mock ──
export class MockConversationStore extends MockStore {
  async create(data) {
    const { Conversation } = await import("../models.mjs");
    const conv = new Conversation({
      contactId: data.contactId,
      channel: data.channel || "webchat",
      messages: data.messages || [],
      status: data.status || "active",
    });
    return this.put(conv.toJSON());
  }

  async findByContact(contactId) {
    return Array.from(this.items.values())
      .filter(c => c.contactId === contactId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async findByStatus(status) {
    return Array.from(this.items.values()).filter(c => c.status === status);
  }

  async addMessage(conversationId, role, content) {
    const conv = await this.get(conversationId);
    if (!conv) return null;
    if (!conv.messages) conv.messages = [];
    conv.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    conv.updatedAt = new Date().toISOString();
    return this.put(conv);
  }

  async assignTo(conversationId, agentId) {
    const conv = await this.get(conversationId);
    if (!conv) return null;
    conv.assignedTo = agentId;
    conv.updatedAt = new Date().toISOString();
    return this.put(conv);
  }

  async getTranscript(conversationId) {
    const conv = await this.get(conversationId);
    if (!conv || !conv.messages) return "";
    return conv.messages.map(m => `[${m.role}] ${m.content}`).join("\n");
  }
}

// ── Factory de stores mock ──
export function createMockStores() {
  return {
    contacts: new MockContactStore(),
    deals: new MockDealStore(),
    conversations: new MockConversationStore(),
  };
}

// ── Mock del agente CRM ──
export function createMockAgent(fixedResponse = "Respuesta de prueba del CRM") {
  return {
    invoke: async ({ messages }) => {
      return {
        messages: [
          ...messages,
          { role: "assistant", content: fixedResponse },
        ],
      };
    },
    invokeWithTimeout: async (prompt) => {
      return fixedResponse;
    },
  };
}

// ── Mock lento (timeout) ──
export function createSlowMockAgent(delayMs = 60000) {
  return {
    invoke: async () => {
      await new Promise(r => setTimeout(r, delayMs));
      return { messages: [{ role: "assistant", content: "too late" }] };
    },
  };
}

// ── Mock de canales ──
export const mockWhatsAppSend = { lastCall: null };
export const mockInstagramSend = { lastCall: null };

export function createMockWhatsAppChannel() {
  return {
    sendWhatsAppMessage: async (phone, text) => {
      mockWhatsAppSend.lastCall = { phone, text };
      return true;
    },
    startWhatsApp: async () => {},
    getWhatsAppStatus: () => ({ connected: false }),
  };
}

export function createMockInstagramChannel() {
  return {
    sendInstagramMessage: async (id, text) => {
      mockInstagramSend.lastCall = { id, text };
      return true;
    },
  };
}

// ── Resetea todos los mocks ──
export function resetMocks() {
  mockWhatsAppSend.lastCall = null;
  mockInstagramSend.lastCall = null;
}
