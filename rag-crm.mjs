/**
 * rag-crm.mjs — Motor RAG para conversaciones del CRM
 *
 * Permite búsqueda semántica sobre el historial de conversaciones
 * usando el mismo pipeline que rag-engine.mjs pero indexando
 * los mensajes del CRM.
 *
 * Uso:
 *   import { askCRM, retrieveCRM } from "./rag-crm.mjs";
 *   const answer = await askCRM("qué dijo María sobre precios?");
 */

import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { Embeddings } from "@langchain/core/embeddings";
import { chunkArray } from "@langchain/core/utils/chunk_array";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { ConversationStore } from "./stores/conversation-store.mjs";
import { ContactStore } from "./stores/contact-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_DIR = path.resolve(__dirname, "data", "faiss-conversations");
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

async function buildConversationDocs() {
  const convStore = ConversationStore.getInstance();
  const contactStore = ContactStore.getInstance();
  const conversations = await convStore.getAll();
  const docs = [];

  for (const conv of conversations) {
    const contact = await contactStore.get(conv.contactId);
    const contactName = contact?.name || "Desconocido";

    if (!conv.messages || conv.messages.length === 0) continue;

    // Crear un documento por conversación
    const transcript = conv.messages.map(m =>
      `[${m.role === "customer" ? contactName : m.role.toUpperCase()}] ${m.content}`
    ).join("\n");

    docs.push(new Document({
      pageContent: transcript,
      metadata: {
        source: `conversation:${conv.id}`,
        contactId: conv.contactId,
        contactName,
        channel: conv.channel,
        type: "conversation",
        date: conv.createdAt,
      },
    }));

    // También crear un documento por mensaje individual para búsqueda más precisa
    for (const msg of conv.messages) {
      docs.push(new Document({
        pageContent: msg.content,
        metadata: {
          source: `message:${conv.id}`,
          contactId: conv.contactId,
          contactName,
          channel: conv.channel,
          role: msg.role,
          timestamp: msg.timestamp,
          type: "message",
        },
      }));
    }
  }

  return docs;
}

/**
 * Indexa todas las conversaciones del CRM en FAISS.
 */
export async function indexConversations() {
  console.log("🔍 Preparando documentos de conversaciones...");
  const docs = await buildConversationDocs();
  console.log(`   ${docs.length} documentos generados`);

  if (docs.length === 0) {
    console.log("⚠️  No hay conversaciones para indexar.");
    return;
  }

  console.log("✂️  Dividiendo en chunks...");
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });
  const chunks = await splitter.splitDocuments(docs);
  console.log(`   → ${chunks.length} chunks generados`);

  console.log(`🧠 Generando embeddings y guardando índice FAISS (${chunks.length} chunks en lotes de 20)...`);
  const store = await createBatchedVectorStore(chunks, getEmbeddings(), { indexDir: INDEX_DIR });
  _store = store;

  console.log(`✅ Índice de conversaciones guardado en ${INDEX_DIR}`);
  console.log(`   • ${chunks.length} chunks vectorizados`);
  console.log(`   • Dimensión: 384`);
}

/**
 * Crea FAISS index procesando documentos en lotes secuenciales
 * con wrapper SequentialEmbeddings para evitar paralelismo de ONNX.
 */
async function createBatchedVectorStore(docs, baseEmbeddings, opts = {}) {
  const { batchSize = 20, embedBatchSize = 10, indexDir = INDEX_DIR } = opts;
  const embeddings = new SequentialEmbeddings({ inner: baseEmbeddings, batchSize: embedBatchSize });
  const total = docs.length;
  const totalLotes = Math.ceil(total / batchSize);

  // Primer lote — inicializa el store
  console.log(`   Lote 1/${totalLotes} (${Math.min(batchSize, total)} docs)...`);
  let store = await FaissStore.fromDocuments(docs.slice(0, batchSize), embeddings);
  if (typeof global.gc === "function") { global.gc(); global.gc(); }

  // Resto de lotes
  let idx = batchSize;
  let lote = 2;
  while (idx < total) {
    const end = Math.min(idx + batchSize, total);
    console.log(`   Lote ${lote}/${totalLotes} (${end - idx} docs)...`);
    await store.addDocuments(docs.slice(idx, end));
    idx = end;
    lote++;
    if (typeof global.gc === "function") { global.gc(); global.gc(); }
  }

  await store.save(indexDir);
  return store;
}

/**
 * Wrapper secuencial para embedDocuments — mismo patrón que vector-store.mjs
 * pero standalone para no crear dependencia circular.
 */
class SequentialEmbeddings extends Embeddings {
  constructor(fields) {
    super(fields ?? {});
    this.inner = fields?.inner;
    this.batchSize = fields?.batchSize ?? 10;
  }

  async embedDocuments(texts) {
    const batches = chunkArray(texts, this.batchSize);
    const embeddings = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const result = await this.inner.runEmbedding(batch);
      for (const vec of result) embeddings.push(vec);
      if (typeof global.gc === "function" && i % 2 === 0) global.gc();
    }

    return embeddings;
  }

  async embedQuery(text) {
    return this.inner.embedQuery(text);
  }
}

/**
 * Pregunta sobre las conversaciones del CRM usando RAG.
 */
export async function askCRM(question, opts = {}) {
  const { topK = 5 } = opts;
  const store = await loadVectorStore();
  if (!store) {
    return {
      answer: "⚠️  Índice de conversaciones no encontrado. Ejecuta: npm run index:conversations (en agentes/crm/)",
      sources: [],
    };
  }

  const fragments = await store.similaritySearchWithScore(question, topK);
  if (fragments.length === 0) {
    return { answer: "No encontré información relevante en las conversaciones.", sources: [] };
  }

  const context = fragments.map(([doc, score], i) => {
    const meta = doc.metadata;
    return `[${i + 1}] Contacto: ${meta.contactName} | Canal: ${meta.channel} | Tipo: ${meta.type}\n${doc.pageContent}\n`;
  }).join("\n---\n");

  const llm = new ChatOpenAI({ model: process.env.OPENAI_MODEL || "deepseek-chat", temperature: 0.2 });
  const prompt = PromptTemplate.fromTemplate(
    "Eres un asistente CRM que analiza conversaciones con clientes.\n\n" +
    "Contexto de conversaciones:\n{context}\n\n" +
    "Pregunta: {question}\n\n" +
    "Responde basado SOLO en el contexto. Menciona nombres de contactos y canales."
  );

  const answer = await llm.invoke(await prompt.format({ context, question }));

  const sources = [...new Set(fragments.map(([d]) => d.metadata.contactName).filter(Boolean))];

  return {
    answer: answer.content,
    sources,
    fragments: fragments.map(([d, s]) => ({ content: d.pageContent, meta: d.metadata, score: s })),
  };
}

// CLI directo
if (process.argv[1]?.includes("rag-crm.mjs")) {
  const cmd = process.argv[2];
  if (cmd === "--index") {
    await indexConversations();
  } else if (cmd === "--ask") {
    const q = process.argv.slice(3).join(" ");
    const result = await askCRM(q);
    console.log("\n" + result.answer);
  } else {
    console.log("Uso: node agentes/crm/rag-crm.mjs --index");
    console.log('     node agentes/crm/rag-crm.mjs --ask "qué dijo María"');
  }
}
