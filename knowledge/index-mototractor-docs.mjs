/**
 * index-mototractor-docs.mjs — Indexa documentos extraídos en FAISS incrementalmente
 *
 * Uso: node agentes/crm/knowledge/index-mototractor-docs.mjs
 */

import "dotenv/config";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { inspect } from "util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_DIR = path.resolve(__dirname, "..", "data", "faiss-mototractor");

async function main() {
  console.log("📂 Cargando documentos extraídos...");
  const raw = JSON.parse(await fs.readFile(path.resolve(__dirname, "..", "data", "mototractor-extracted.json"), "utf-8"));
  console.log(`   → ${raw.length} docs`);

  const docs = raw.map(d => new Document({
    pageContent: d.content,
    metadata: { source: d.path, name: d.name, category: d.category },
  }));

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 200, chunkOverlap: 20 });
  const chunks = await splitter.splitDocuments(docs);
  console.log(`✂️  ${chunks.length} chunks`);

  console.log("🧠 Indexando en FAISS incrementalmente...");
  const embeddings = new HuggingFaceTransformersEmbeddings({ model: "Xenova/all-MiniLM-L6-v2", batchSize: 1 });

  let store = null;

  for (let i = 0; i < chunks.length; i++) {
    try {
      if (i === 0) {
        store = await FaissStore.fromDocuments([chunks[i]], embeddings);
      } else {
        const vector = await embeddings.embedQuery(chunks[i].pageContent);
        await store.addVectors([vector], [chunks[i]]);
      }
    } catch (err) {
      console.log(`\n⚠️  Error en chunk ${i}: ${err.message}`);
      continue;
    }

    if ((i + 1) % 50 === 0 || i === chunks.length - 1) {
      process.stdout.write(`\r   ${i + 1}/${chunks.length} chunks`);
    }
  }

  console.log("\n💾 Guardando índice...");
  await store.save(INDEX_DIR);
  console.log(`✅ ${chunks.length} chunks indexados en ${INDEX_DIR}`);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
