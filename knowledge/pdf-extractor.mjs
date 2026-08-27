/**
 * pdf-extractor.mjs — Extrae texto de PDFs del Mototractor
 *
 * Usa pdfjs-dist legacy ESM build (compatible con Node.js v20).
 * Lee archivos .txt, .tex, .docx y .pdf para indexación RAG.
 */

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(__dirname, "../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = "file://" + workerPath;

const MOTOTRACTOR_DIR = "/mototractor/Mototractor Project";

/**
 * Extrae texto de un archivo PDF.
 */
export async function extractPdfText(filePath) {
  try {
    const data = await fs.readFile(filePath);
    const doc = await pdfjs.getDocument({ data: data.buffer }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(" ");
      pages.push(text);
    }
    return pages.join("\n\n");
  } catch (err) {
    console.error(`  ⚠️  Error extrayendo PDF ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

/**
 * Extrae texto de un archivo .txt o .tex.
 */
export async function extractTextFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    console.error(`  ⚠️  Error leyendo ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

/**
 * Encuentra los PDFs más relevantes del Mototractor en orden de prioridad.
 */
export async function findRelevantDocuments() {
  const allFiles = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Saltar carpetas no relevantes para indexación
        if (!["FOTOS MT", "Photos (1)", "Madeleine", "Presentación Energía Solar Fotográfico Estructurado Blanco"].includes(entry.name)) {
          await walk(fullPath);
        }
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".pdf", ".txt", ".tex"].includes(ext)) {
          allFiles.push(fullPath);
        }
      }
    }
  }

  await walk(MOTOTRACTOR_DIR);
  return allFiles;
}

/**
 * Prioriza archivos y extrae contenido.
 * Retorna array de { path, content, type, category }
 */
export async function extractAllTexts(filePaths, { limit = 50 } = {}) {
  const results = [];

  // Priorizar archivos clave
  const priorityKeywords = [
    "FICHA TECNICA", "TESIS", "PATENTE", "FALLAS", "Plan_de_Negocios",
    "ARTICULO", "APLICACIÓN MÓVIL", "BANCO DE PRUEBAS", "PRUEBAS 2025",
    "Descripción Técnica", "Reivindicaciones", "ESTADO DEL ARTE",
    "Propuesta de valor", "Mercado", "guia_ensamble",
  ];

  const scored = filePaths.map(fp => {
    const name = path.basename(fp).toUpperCase();
    const ext = path.extname(fp).toLowerCase();
    let score = 0;
    for (const kw of priorityKeywords) {
      if (name.includes(kw.toUpperCase())) score += 10;
    }
    // Text files scoring
    if (name.startsWith("DATOS_") && ext === ".txt") score += 5;
    // General PDFs
    if (ext === ".pdf") score += 1;
    if (ext === ".tex") score += 2;
    return { path: fp, score, ext };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, limit);

  for (const entry of selected) {
    const name = path.basename(entry.path);
    const category = categorizeDocument(entry.path);

    let content = null;
    if (entry.ext === ".pdf") {
      content = await extractPdfText(entry.path);
    } else {
      content = await extractTextFile(entry.path);
    }

    if (content && content.trim().length > 20) {
      results.push({
        path: entry.path,
        name,
        category,
        content: content.trim(),
        size: content.length,
      });
    }
  }

  return results;
}

function categorizeDocument(filePath) {
  const p = filePath.toUpperCase();
  if (p.includes("PATENTE")) return "patente";
  if (p.includes("TESIS")) return "tesis";
  if (p.includes("CONGRESO")) return "congreso";
  if (p.includes("FICHA TECNICA")) return "ficha-tecnica";
  if (p.includes("FALLAS")) return "fallas";
  if (p.includes("PRUEBAS 2025") || p.includes("PRUEBA")) return "pruebas";
  if (p.includes("PLAN DE DESARROLLO") || p.includes("Plan_de_Negocios")) return "plan-negocio";
  if (p.includes("BECA") || p.includes("SISBEN")) return "documentos-oficiales";
  if (p.includes("TEMPERATURA")) return "investigacion-terna";
  if (p.includes("DATOS_")) return "datos-sensores";
  if (p.includes("SHIGLEY")) return "referencia-libro";
  if (p.includes("PRESENTACION") || p.includes("PITCH")) return "presentacion";
  return "documentos";
}
