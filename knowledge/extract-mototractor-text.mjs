/**
 * extract-mototractor-text.mjs — Paso 1: Extraer texto de PDFs a JSON cache
 *
 * Uso: node agentes/crm/knowledge/extract-mototractor-text.mjs
 */

import { findRelevantDocuments, extractAllTexts } from "./pdf-extractor.mjs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.resolve(__dirname, "..", "data", "mototractor-extracted.json");

async function main() {
  console.log("🔍 Buscando documentos...");
  const files = await findRelevantDocuments();

  // Extraer los 20 documentos más relevantes (no indexar, solo extraer texto)
  console.log("📖 Extrayendo texto de top 20 documentos...");
  const extracted = await extractAllTexts(files, { limit: 20 });

  // Resumen
  const cats = {};
  for (const d of extracted) { cats[d.category] = (cats[d.category] || 0) + 1; }
  console.log("\n📂 Por categoría:");
  for (const [cat, count] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
    console.log(`   • ${cat}: ${count}`);
  }

  const totalChars = extracted.reduce((s, d) => s + d.size, 0);
  console.log(`\n📊 Total: ${extracted.length} documentos, ${totalChars.toLocaleString()} caracteres`);

  // Guardar a JSON (sin incluir el contenido completo para no saturar)
  const cache = extracted.map(d => ({
    name: d.name,
    category: d.category,
    path: d.path,
    size: d.size,
    content: d.content,
  }));
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`💾 Caché guardado en ${CACHE_FILE}`);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
