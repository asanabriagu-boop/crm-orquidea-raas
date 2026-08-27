/**
 * supervisor.test.mjs — Diagnóstico del supervisor de procesos del CRM
 *
 * Verifica el estado del proceso anterior (2026-08-19): la solución
 * start-daemon/stop-daemon que desacopla el server de la terminal (setsid)
 * para que reiniciarlo NO tumbe la sesión del CLI.
 *
 * El diagnóstico inspecciona:
 *   1. Existencia/ejecutabilidad de los scripts de arranque.
 *   2. Sintaxis válida (bash -n) de todos los scripts.
 *   3. Disponibilidad de `setsid` (dependencia clave del desacople).
 *   4. Que los scripts usan setsid (NO foreground) — la propiedad que resuelve
 *      el problema original.
 *   5. Contexto real: el PID 1 del entorno es el server del CRM.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRM_DIR = path.join(__dirname, "..");
const SCRIPTS = ["start-daemon", "stop-daemon", "start-direct", "start-webchat", "start-tablet"];

function hasCmd(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

describe("CRM supervisor de procesos — estado", () => {
  it("existen los scripts start-daemon y stop-daemon (la solución)", () => {
    for (const s of ["start-daemon", "stop-daemon"]) {
      const f = path.join(CRM_DIR, s);
      expect(fs.existsSync(f), `${s} debe existir`).toBe(true);
      const st = fs.statSync(f);
      expect(st.mode & 0o111, `${s} debe ser ejecutable`).not.toBe(0);
    }
  });

  it("todos los scripts de arranque tienen sintaxis bash válida (bash -n)", () => {
    for (const s of SCRIPTS) {
      const f = path.join(CRM_DIR, s);
      expect(fs.existsSync(f), `${s} debe existir`).toBe(true);
      expect(() => {
        execSync(`bash -n "${f}"`, { stdio: "pipe" });
      }, `${s} debe pasar bash -n`).not.toThrow();
    }
  });

  it("setsid está disponible en el sistema (dependencia del desacople)", () => {
    expect(hasCmd("setsid"), "setsid debe estar en PATH").toBe(true);
  });

  it("start-daemon usa setsid (lanza en sesión propia, NO pegada a la terminal)", () => {
    const content = fs.readFileSync(path.join(CRM_DIR, "start-daemon"), "utf-8");
    expect(content).toMatch(/setsid/);
    // El server debe ir en background (&), no en foreground con wait que (bloquea la terminal).
    expect(content).toMatch(/crm-server\.mjs/);
    expect(content).toMatch(/data\/crm\.pid/);
  });

  it("stop-daemon mata por PID file (no por patrón que afecte al PID 1 del entorno)", () => {
    const content = fs.readFileSync(path.join(CRM_DIR, "stop-daemon"), "utf-8");
    expect(content).toMatch(/data\/crm\.pid/);
    expect(content).toMatch(/kill .*\$PID/s);
  });

  it("start-direct y start-webchat delegan en start-daemon (no corren server en foreground)", () => {
    for (const s of ["start-direct", "start-webchat"]) {
      const content = fs.readFileSync(path.join(CRM_DIR, s), "utf-8");
      expect(content, `${s} debe invocar start-daemon`).toMatch(/start-daemon/);
    }
  });

  it("contexto real: el PID 1 del entorno es el server del CRM (node crm-server.mjs)", () => {
    let cmd = "";
    try {
      cmd = execSync("tr '\\0' ' ' < /proc/1/cmdline", { stdio: "pipe" }).toString().trim();
    } catch {
      // /proc no accesible en todos los entornos; el test no puede confirmar el PID1.
      //  skip
    }
    if (cmd) {
      expect(cmd).toMatch(/crm-server\.mjs/);
    } else {
      // Entorno sin /proc: no bloqueamos, solo advertimos.
      console.warn("⚠️  /proc/1 no accesible — no se pudo confirmar el PID1.");
    }
  });

  it("los scripts antiguos ya no lanzan el server inline (causa del problema)", () => {
    // El problema original: correr node crm-server.mjs en foreground y wait.
    // start-direct y start-webchat ahora solo delegan en start-daemon, así que
    // fuera de comentarios (#) no debe haber un `node crm-server.mjs` que lance
    // el server en esta terminal. Filtramos líneas de comentario.
    for (const s of ["start-direct", "start-webchat"]) {
      const lines = fs
        .readFileSync(path.join(CRM_DIR, s), "utf-8")
        .split("\n")
        .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
      const effective = lines.join("\n");
      expect(effective, `${s} no debe lanzar node crm-server.mjs inline`).not.toMatch(/node crm-server\.mjs/);
    }
  });
});
