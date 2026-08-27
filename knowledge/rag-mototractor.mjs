/**
 * rag-mototractor.mjs — RAG para documentación técnica del Mototractor
 *
 * Permite búsqueda semántica sobre los PDFs y documentos indexados.
 * El CRM Agent la usa para responder preguntas técnicas con información
 * real de los documentos del Mototractor.
 *
 * Uso:
 *   import { retrieveMototractorDocs } from "./rag-mototractor.mjs";
 *   const docs = await retrieveMototractorDocs("fuerza máxima en primera marcha");
 */

import "dotenv/config";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_DIR = path.resolve(__dirname, "..", "data", "faiss-mototractor");
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

let _embeddings = null;
let _store = null;

function getEmbeddings() {
  if (!_embeddings) {
    _embeddings = new HuggingFaceTransformersEmbeddings({ model: EMBEDDING_MODEL });
  }
  return _embeddings;
}

async function loadVectorStore() {
  if (_store) return _store;
  try {
    await fs.access(INDEX_DIR);
    _store = await FaissStore.load(INDEX_DIR, getEmbeddings());
    return _store;
  } catch {
    return null;
  }
}

/**
 * Busca documentos relevantes del Mototractor por similitud semántica.
 * @param {string} question - Consulta en lenguaje natural
 * @param {object} opts - { topK, category, minScore }
 * @returns {Promise<Array<{content, metadata, score}>>}
 */
export async function retrieveMototractorDocs(question, opts = {}) {
  const { topK = 5 } = opts;
  const store = await loadVectorStore();
  if (!store) return [];

  const fragments = await store.similaritySearchWithScore(question, topK * 2);

  const results = fragments
    .filter(([doc, score]) => {
      if (opts.category && doc.metadata.category !== opts.category) return false;
      return true;
    })
    .slice(0, topK)
    .map(([doc, score]) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
      score,
    }));

  return results;
}

/**
 * Genera contexto RAG formateado para inyectar en el prompt del agente.
 */
export async function formatRagContext(question, topK = 3) {
  const docs = await retrieveMototractorDocs(question, { topK });
  if (docs.length === 0) return "";

  const parts = docs.map((d, i) => {
    const name = d.metadata?.name || "Documento";
    const category = d.metadata?.category || "general";
    return `[${i + 1}] ${name} (${category})\n${d.content.substring(0, 1000)}`;
  });

  return [
    "=== DOCUMENTACIÓN TÉCNICA DEL MOTOTRACTOR (extraída de PDFs originales) ===",
    ...parts,
    "=== FIN DOCUMENTACIÓN ===",
  ].join("\n\n");
}

/**
 * Verifica si el índice FAISS existe.
 */
export async function isIndexReady() {
  try {
    await fs.access(path.join(INDEX_DIR, "docstore.json"));
    return true;
  } catch {
    return false;
  }
}
