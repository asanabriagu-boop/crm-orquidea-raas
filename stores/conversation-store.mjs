/**
 * conversation-store.mjs — Store de Conversaciones
 * Soporta multi-tenant: constructor acepta tenantId opcional.
 */
import { BaseStore } from "./base-store.mjs";
import { Conversation } from "../models.mjs";

const _defaultInstance = {
  store: null,
  get() {
    if (!this.store) this.store = new ConversationStore(null);
    return this.store;
  }
};

export class ConversationStore extends BaseStore {
  constructor(tenantId = null) {
    super("conversations", tenantId);
  }

  /** @deprecated Usa StoreFactory.forTenant() en código nuevo */
  static getInstance() {
    return _defaultInstance.get();
  }

  async create(data) {
    const conv = new Conversation(data);
    return this.put(conv.toJSON());
  }

  async findByContact(contactId) {
    const all = await this.getAll();
    return all
      .filter(c => c.contactId === contactId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async findByStatus(status) {
    return this.find(c => c.status === status);
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
    // SEGURIDAD: podar a máximo 100 mensajes (evita OOM por historiales largos)
    if (conv.messages.length > 100) {
      const excess = conv.messages.length - 100;
      conv.messages.splice(0, excess);
    }
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
    return conv.messages
      .map(m => `[${m.role}] ${m.content}`)
      .join("\n");
  }
}
