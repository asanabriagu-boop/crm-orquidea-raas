/**
 * crm-tools.mjs — Tools CRUD del CRM Conversacional
 *
 * Factory pattern: createCrmTools(stores) devuelve tools vinculadas
 * a stores de un tenant específico.
 *
 * También exporta crmTools[] (backward compat) que usa getInstance().
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Extrae el id del contacto de la interacción actual desde la config del run.
 * El bridge lo inyecta como `config.configurable.contactId` en cada invocación.
 * @param {Object|null} config - config del run recibida por la tool (3er arg de func).
 * @returns {string|null}
 */
function currentContact(config) {
  return config?.configurable?.contactId ?? null;
}

/**
 * Crea tools CRM vinculadas a los stores de un tenant.
 * @param {Object} stores - { contacts, deals, conversations }
 * @returns {DynamicStructuredTool[]}
 */
export function createCrmTools(stores) {
  const { contacts: contactStore, deals: dealStore, conversations: convStore } = stores;

  return [
    // ═══════════════════════════════════════════════
    // CONTACT TOOLS
    // ═══════════════════════════════════════════════
    new DynamicStructuredTool({
      name: "crear_contacto",
      description: "Crea un nuevo contacto en el CRM. Requiere al menos nombre o teléfono.",
      schema: z.object({
        name: z.string().describe("Nombre del contacto"),
        phone: z.string().optional().describe("Teléfono del contacto"),
        email: z.string().optional().describe("Email del contacto"),
        source: z.string().optional().describe("Origen: whatsapp, instagram, webchat, manual"),
        company: z.string().optional().describe("Empresa del contacto"),
        tags: z.array(z.string()).optional().describe("Tags para categorizar el contacto"),
      }),
      func: async ({ name, phone, email, source, company, tags }) => {
        const contact = await contactStore.create({ name, phone, email, source, company, tags });
        return JSON.stringify(contact, null, 2);
      },
    }),

    new DynamicStructuredTool({
      name: "listar_contactos",
      description: "Lista contactos del CRM. Opcionalmente filtra por source o busca por texto.",
      schema: z.object({
        source: z.string().optional().describe("Filtrar por origen: whatsapp, instagram, webchat, manual"),
        search: z.string().optional().describe("Búsqueda por nombre, teléfono o email"),
        limit: z.number().optional().default(20).describe("Máximo de resultados"),
      }),
      func: async ({ source, search, limit }) => {
        let contacts;
        if (search) {
          contacts = await contactStore.search(search);
        } else if (source) {
          contacts = await contactStore.findBySource(source);
        } else {
          contacts = await contactStore.getAll();
        }
        contacts = contacts.slice(0, limit);
        const summary = contacts.map(c => ({
          id: c.id, name: c.name, phone: c.phone, email: c.email,
          source: c.source, tags: c.tags, lastActivity: c.lastActivity,
        }));
        return JSON.stringify({ total: contacts.length, contacts: summary }, null, 2);
      },
    }),

    new DynamicStructuredTool({
      name: "obtener_contacto",
      description: "Obtiene un contacto por su ID con toda su información incluyendo conversaciones y deals asociados. Solo puede consultar el contacto de la interacción actual.",
      schema: z.object({ id: z.string().describe("ID del contacto") }),
      func: async ({ id }, runManager, config) => {
        const scopedId = currentContact(config);
        if (scopedId && id !== scopedId) {
          return `Acceso denegado: solo puedes consultar el contacto de la interacción actual, no el de otros clientes.`;
        }
        const contact = await contactStore.get(id);
        if (!contact) return `Contacto con ID "${id}" no encontrado.`;
        const deals = await dealStore.findByContact(id);
        const conversations = await convStore.findByContact(id);
        return JSON.stringify({
          ...contact,
          deals: deals.map(d => ({ id: d.id, title: d.title, value: d.value, stage: d.stage })),
          conversations: conversations.map(c => ({
            id: c.id, channel: c.channel, status: c.status,
            messageCount: c.messages?.length || 0, lastUpdate: c.updatedAt,
          })),
        }, null, 2);
      },
    }),

    // ═══════════════════════════════════════════════
    // DEAL TOOLS
    // ═══════════════════════════════════════════════
    new DynamicStructuredTool({
      name: "crear_deal",
      description: "Crea una nueva oportunidad de venta (deal) asociada a un contacto.",
      schema: z.object({
        contactId: z.string().describe("ID del contacto asociado"),
        title: z.string().describe("Título del deal"),
        value: z.number().optional().default(0).describe("Valor monetario del deal"),
        stage: z.string().optional().default("lead").describe("Etapa: lead, qualified, proposal, negotiation, closed_won, closed_lost"),
        source: z.string().optional().default("manual").describe("Origen del deal"),
      }),
      func: async ({ contactId, title, value, stage, source }) => {
        const deal = await dealStore.create({ contactId, title, value, stage, source });
        return JSON.stringify(deal, null, 2);
      },
    }),

    new DynamicStructuredTool({
      name: "listar_deals",
      description: "Lista oportunidades de venta del contacto de la interacción actual. Opcionalmente filtra por etapa. Nunca lista deals de otros clientes.",
      schema: z.object({
        stage: z.string().optional().describe("Filtrar por etapa: lead, qualified, proposal, negotiation, closed_won, closed_lost"),
        contactId: z.string().optional().describe("ID del contacto actual (debe coincidir con el de la interacción)"),
        limit: z.number().optional().default(20),
      }),
      func: async ({ stage, contactId, limit }, runManager, config) => {
        const scopedId = currentContact(config);
        if (contactId && scopedId && contactId !== scopedId) {
          return JSON.stringify({ total: 0, deals: [], error: "Acceso denegado: solo puedes consultar tus propios deals." }, null, 2);
        }
        const effId = contactId || scopedId;
        if (!effId) {
          return JSON.stringify({ total: 0, deals: [], error: "No se indicó un contacto para listar deals." }, null, 2);
        }
        // Siempre acotado al contacto actual de la interacción. El stage nunca
        // amplía el alcance más allá de ese contacto (privacidad por-scope).
        let deals = await dealStore.findByContact(effId);
        if (stage) {
          deals = deals.filter(d => d.stage === stage);
        }
        deals = deals.slice(0, limit);
        return JSON.stringify({ total: deals.length, deals }, null, 2);
      },
    }),

    new DynamicStructuredTool({
      name: "actualizar_etapa_deal",
      description: "Actualiza la etapa de un deal (moverlo en el pipeline de ventas). Solo puede mover deals del contacto de la interacción actual.",
      schema: z.object({
        dealId: z.string().describe("ID del deal"),
        stage: z.string().describe("Nueva etapa: lead, qualified, proposal, negotiation, closed_won, closed_lost"),
      }),
      func: async ({ dealId, stage }, runManager, config) => {
        const deal = await dealStore.get(dealId);
        if (!deal) return `Deal con ID "${dealId}" no encontrado.`;
        const scopedId = currentContact(config);
        if (scopedId && deal.contactId !== scopedId) {
          return `Acceso denegado: este deal pertenece a otro cliente y no puedes actualizarlo.`;
        }
        const updated = await dealStore.updateStage(dealId, stage);
        if (!updated) return `Deal con ID "${dealId}" no encontrado.`;
        return JSON.stringify(updated, null, 2);
      },
    }),

    new DynamicStructuredTool({
      name: "resumen_pipeline",
      description: "Obtiene un resumen de los deals del contacto de la interacción actual: deals por etapa y valor total. Nunca resume el pipeline de otros clientes.",
      schema: z.object({
        contactId: z.string().optional().describe("ID del contacto actual (debe coincidir con el de la interacción)"),
      }),
      func: async ({ contactId }, runManager, config) => {
        const scopedId = currentContact(config);
        if (contactId && scopedId && contactId !== scopedId) {
          return JSON.stringify({ stages: {}, totalDeals: 0, totalValue: 0, error: "Acceso denegado: solo puedes consultar tus propios deals." }, null, 2);
        }
        const effId = contactId || scopedId;
        if (!effId) {
          return JSON.stringify({ stages: {}, totalDeals: 0, totalValue: 0, error: "No se indicó un contacto para resumir el pipeline." }, null, 2);
        }
        const deals = await dealStore.findByContact(effId);
        const stages = {};
        let totalValue = 0;
        for (const d of deals) {
          stages[d.stage] = (stages[d.stage] || 0) + 1;
          totalValue += d.value || 0;
        }
        return JSON.stringify({ stages, totalDeals: deals.length, totalValue }, null, 2);
      },
    }),

    // ═══════════════════════════════════════════════
    // CONVERSATION TOOLS
    // ═══════════════════════════════════════════════
    new DynamicStructuredTool({
      name: "crear_conversacion",
      description: "Inicia una nueva conversación para un contacto en un canal específico.",
      schema: z.object({
        contactId: z.string().describe("ID del contacto"),
        channel: z.string().optional().default("webchat").describe("Canal: whatsapp, instagram, webchat, email"),
        firstMessage: z.string().optional().describe("Primer mensaje de la conversación"),
      }),
      func: async ({ contactId, channel, firstMessage }) => {
        const conv = await convStore.create({ contactId, channel });
        if (firstMessage) {
          const updated = await convStore.addMessage(conv.id, "customer", firstMessage);
          return JSON.stringify(updated, null, 2);
        }
        return JSON.stringify(conv, null, 2);
      },
    }),

    new DynamicStructuredTool({
      name: "agregar_mensaje",
      description: "Agrega un mensaje a una conversación existente.",
      schema: z.object({
        conversationId: z.string().describe("ID de la conversación"),
        role: z.enum(["customer", "agent", "ai", "system"]).describe("Rol: customer, agent, ai, system"),
        content: z.string().describe("Contenido del mensaje"),
      }),
      func: async ({ conversationId, role, content }) => {
        const conv = await convStore.addMessage(conversationId, role, content);
        if (!conv) return `Conversación con ID "${conversationId}" no encontrada.`;
        return JSON.stringify({ id: conv.id, messageCount: conv.messages?.length }, null, 2);
      },
    }),

    new DynamicStructuredTool({
      name: "obtener_conversacion",
      description: "Obtiene el transcript completo de una conversación.",
      schema: z.object({ id: z.string().describe("ID de la conversación") }),
      func: async ({ id }) => {
        const conv = await convStore.get(id);
        if (!conv) return `Conversación con ID "${id}" no encontrada.`;
        return JSON.stringify(conv, null, 2);
      },
    }),

    new DynamicStructuredTool({
      name: "listar_conversaciones",
      description: "Lista conversaciones activas o filtradas por estado.",
      schema: z.object({
        status: z.string().optional().describe("Filtrar por estado: active, waiting, resolved"),
        contactId: z.string().optional().describe("Filtrar por contacto"),
        limit: z.number().optional().default(20),
      }),
      func: async ({ status, contactId, limit }) => {
        let conversations;
        if (contactId) {
          conversations = await convStore.findByContact(contactId);
        } else if (status) {
          conversations = await convStore.findByStatus(status);
        } else {
          conversations = await convStore.getAll();
        }
        conversations = conversations.slice(0, limit).map(c => ({
          id: c.id, contactId: c.contactId, channel: c.channel, status: c.status,
          assignedTo: c.assignedTo, messageCount: c.messages?.length || 0, lastUpdate: c.updatedAt,
        }));
        return JSON.stringify({ total: conversations.length, conversations }, null, 2);
      },
    }),

    new DynamicStructuredTool({
      name: "asignar_conversacion",
      description: "Asigna una conversación a un agente humano o la devuelve a la IA.",
      schema: z.object({
        conversationId: z.string().describe("ID de la conversación"),
        assignedTo: z.string().describe("Asignar a: 'ai' o ID del agente humano"),
      }),
      func: async ({ conversationId, assignedTo }) => {
        const conv = await convStore.assignTo(conversationId, assignedTo);
        if (!conv) return `Conversación con ID "${conversationId}" no encontrada.`;
        return `✅ Conversación asignada a: ${assignedTo}`;
      },
    }),

    // ═══════════════════════════════════════════════
    // RAG TOOL (Mototractor)
    // ═══════════════════════════════════════════════
    new DynamicStructuredTool({
      name: "buscar_documentacion_mototractor",
      description: "Busca en la documentación técnica del Mototractor (PDFs, tesis, patentes, fichas técnicas) para responder preguntas técnicas, de componentes, pruebas de campo, especificaciones, etc.",
      schema: z.object({
        consulta: z.string().describe("La consulta técnica sobre el Mototractor"),
        topK: z.number().optional().default(3).describe("Cuantos documentos retornar (1-5)"),
      }),
      func: async ({ consulta, topK = 3 }) => {
        try {
          const { retrieveMototractorDocs } = await import("../knowledge/rag-mototractor.mjs");
          const docs = await retrieveMototractorDocs(consulta, { topK });
          if (docs.length === 0) return "No se encontró documentación técnica relevante para esta consulta.";
          return docs.map((d, i) =>
            `[${i + 1}] ${d.metadata?.name || "Documento"} (${d.metadata?.category || "general"})\n${d.content.substring(0, 1500)}`
          ).join("\n\n---\n\n");
        } catch (err) {
          return `⚠️ Error al buscar documentación: ${err.message}. Usa tu conocimiento base del Mototractor para responder.`;
        }
      },
    }),
  ];
}

// ═══════════════════════════════════════════════
// BACKWARD COMPAT — array con getInstance()
// ═══════════════════════════════════════════════
import { ContactStore } from "../stores/contact-store.mjs";
import { DealStore } from "../stores/deal-store.mjs";
import { ConversationStore } from "../stores/conversation-store.mjs";

/** @deprecated Usa createCrmTools(stores) en código nuevo */
export const crmTools = createCrmTools({
  contacts: ContactStore.getInstance(),
  deals: DealStore.getInstance(),
  conversations: ConversationStore.getInstance(),
});
