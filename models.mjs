/**
 * models.mjs — Modelos de datos del CRM Conversacional
 *
 * Entidades: Contact, Deal, Conversation, Pipeline
 * Incluyen serialización a JSON para persistencia.
 */

import crypto from "crypto";

export class Contact {
  constructor({ id, name, phone, email, source, company, notes = [], tags = [] } = {}) {
    this.id = id || crypto.randomUUID();
    this.name = name || "";
    this.phone = phone || "";
    this.email = email || "";
    this.source = source || "manual";         // "whatsapp" | "instagram" | "webchat" | "manual"
    this.company = company || "";
    this.notes = notes;                        // Array de { text, createdAt, author }
    this.tags = tags;                          // Array de strings
    this.createdAt = new Date().toISOString();
    this.lastActivity = new Date().toISOString();
    this.conversationCount = 0;
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new Contact(data);
  }
}

export class Deal {
  constructor({ id, contactId, title, value = 0, stage = "lead", source = "manual", notes = "" } = {}) {
    this.id = id || crypto.randomUUID();
    this.contactId = contactId;
    this.title = title || "";
    this.value = value;
    this.stage = stage;       // "lead" | "qualified" | "proposal" | "negotiation" | "closed_won" | "closed_lost"
    this.source = source;
    this.notes = notes;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new Deal(data);
  }
}

export class Conversation {
  constructor({ id, contactId, channel = "webchat", messages = [], status = "active", assignedTo = "ai" } = {}) {
    this.id = id || crypto.randomUUID();
    this.contactId = contactId;
    this.channel = channel;     // "whatsapp" | "instagram" | "webchat" | "email"
    this.messages = messages;   // Array de { role, content, timestamp }
    this.status = status;       // "active" | "waiting" | "resolved"
    this.assignedTo = assignedTo; // "ai" | ID de agente humano
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  addMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    const conv = new Conversation(data);
    conv.messages = data.messages || [];
    return conv;
  }
}

export class Pipeline {
  constructor({ name = "default", stages = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"], deals = [] } = {}) {
    this.id = crypto.randomUUID();
    this.name = name;
    this.stages = stages;
    this.deals = deals;  // Array de Deal IDs
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new Pipeline(data);
  }
}

// ═══════════════════════════════════════════════
// MULTI-TENANT MODELS
// ═══════════════════════════════════════════════

export class Tenant {
  constructor({ id, name, slug, plan = "free", isActive = true, branding = {}, payment = {} } = {}) {
    this.id = id || crypto.randomUUID();
    this.name = name || "";
    this.slug = slug || "";
    this.plan = plan;
    this.isActive = isActive;
    this.branding = {
      primaryColor: "#2d5016",
      logoUrl: "",
      companyName: name || "",
      tagline: "",
      ...branding,
    };
    this.payment = {
      gateway: "mock",
      publicKey: "",
      privateKey: "",
      ...payment,
    };
    this.createdAt = new Date().toISOString();
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new Tenant(data);
  }
}

export class Product {
  constructor({ id, tenantId, name, description = "", price = 0, category = "general", imageUrl = "", isActive = true } = {}) {
    this.id = id || crypto.randomUUID();
    this.tenantId = tenantId || null;
    this.name = name || "";
    this.description = description;
    this.price = price;
    this.category = category;
    this.imageUrl = imageUrl;
    this.isActive = isActive;
    this.createdAt = new Date().toISOString();
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new Product(data);
  }
}

export class Cart {
  constructor({ id, tenantId, contactId, conversationId = null, items = [], status = "active" } = {}) {
    this.id = id || crypto.randomUUID();
    this.tenantId = tenantId || null;
    this.contactId = contactId;
    this.conversationId = conversationId;
    this.items = items;  // Array de { productId, name, unitPrice, quantity }
    this.total = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
    this.status = status; // "active" | "checked_out" | "abandoned"
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    const cart = new Cart(data);
    cart.items = data.items || [];
    cart.total = data.total || 0;
    return cart;
  }
}

export class ApiKey {
  constructor({ id, tenantSlug, label, keyPrefix = "crm_sk", keyHash = "", lastDigits = "", expiresAt = null, isActive = true } = {}) {
    this.id = id || crypto.randomUUID();
    this.tenantSlug = tenantSlug || "";
    this.label = label || "";
    this.keyPrefix = keyPrefix;   // "crm_sk_..." primeros 11 chars
    this.keyHash = keyHash;       // hash SHA-256 de la clave completa
    this.lastDigits = lastDigits; // últimos 4 chars para identificación visual
    this.isActive = isActive;
    this.createdAt = new Date().toISOString();
    this.lastUsedAt = null;
    this.expiresAt = expiresAt;
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new ApiKey(data);
  }
}

export class Payment {
  constructor({ id, tenantId, dealId, amount = 0, gateway = "mock", gatewayLink = "", status = "pending" } = {}) {
    this.id = id || crypto.randomUUID();
    this.tenantId = tenantId || null;
    this.dealId = dealId;
    this.amount = amount;
    this.gateway = gateway;       // "mock" | "wompi" | "epulpay"
    this.gatewayLink = gatewayLink;
    this.status = status;         // "pending" | "paid" | "failed"
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new Payment(data);
  }
}
