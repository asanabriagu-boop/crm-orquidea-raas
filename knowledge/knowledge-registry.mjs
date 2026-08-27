/**
 * knowledge-registry.mjs — Registro de conocimiento por tenant
 *
 * Patrón de escalado multi-tenant: cada tenant nuevo agrega aquí su
 * knowledge base y el multi-agente lo resuelve por slug automáticamente.
 *
 * Uso:
 *   import { getKnowledgeForTenant } from "./knowledge-registry.mjs";
 *   const knowledge = getKnowledgeForTenant("motostabily");
 */
import { MOTOTRACTOR_KNOWLEDGE } from "./mototractor-knowledge.mjs";
import { MOTOSTABILY_KNOWLEDGE } from "./motostabily-knowledge.mjs";

const KNOWLEDGE_REGISTRY = {
  mototractor: MOTOTRACTOR_KNOWLEDGE,
  motostabily: MOTOSTABILY_KNOWLEDGE,
};

export function getKnowledgeForTenant(slug) {
  return KNOWLEDGE_REGISTRY[slug] || MOTOTRACTOR_KNOWLEDGE;
}
