/**
 * Arnés de capturas de la interfaz, por CDP directo.
 *
 * POR QUÉ EXISTE:
 *   Verificar la UI con capturas que vuelven por el chat cuesta muchísimo
 *   contexto. Este script lanza Chrome headless, entra al módulo con una sesión
 *   ya firmada, recorre las pestañas y **escribe los PNG en disco**. Así puedo
 *   mirar solo la que importa.
 *
 *   node scripts/ui-shots.mjs <puerto> <token> [outDir]
 *
 * Requiere: Chrome en la ruta estándar de Windows, y un `next dev`/`next start`
 * escuchando en <puerto>. No toca la base de datos.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.argv[2] || 3105);
const TOKEN = process.argv[3];
const OUT = process.argv[4] || join(process.cwd(), "ui-shots");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9333;

if (!TOKEN) {
  console.error("Falta el token de sesión: node scripts/ui-shots.mjs 3105 <token>");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), `quid-shots-${Date.now()}`);

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore", detached: false }
);

let ws;
let msgId = 0;
const pending = new Map();
const events = [];

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }
    }, 30_000);
  });
}

/** Espera a que ocurra un evento de CDP (o se agote el tiempo). */
function waitEvent(name, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = setInterval(() => {
      const found = events.find((e) => e.method === name);
      if (found || Date.now() - started > timeoutMs) {
        clearInterval(tick);
        resolve(found ?? null);
      }
    }, 50);
  });
}

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res?.result?.value;
}

async function shot(name) {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(res.data, "base64"));
  console.log(`  guardada ${name}.png`);
}

async function main() {
  // ── Esperar el endpoint de depuración ──
  let info = null;
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      info = await res.json();
      break;
    } catch {
      /* todavía arrancando */
    }
  }
  if (!info) throw new Error("Chrome no expuso el puerto de depuración");

  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("No hay pestaña para controlar");

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  const base = `http://127.0.0.1:${PORT}`;
  await send("Network.setCookie", {
    name: "next-auth.session-token",
    value: TOKEN,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
  });

  // El módulo activo vive en el store persistido. Sembrarlo ANTES de cargar
  // evita depender del orden entre el deep link y el efecto que fija Dashboard:
  // esa carrera era la razón de que `?module=pantry` a veces se perdiera.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try {
      localStorage.setItem('quid-store', JSON.stringify({
        state: { activeModule: 'pantry' },
        version: 0,
      }));
    } catch (e) {}`,
  });

  // ── Escritorio ──
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${base}/?module=pantry` });
  await waitEvent("Page.loadEventFired");
  await sleep(9000);

  // Diagnóstico: qué módulo cree la app que está activo y qué está pintado.
  if (process.env.PROBE) {
    const diag = await evaluate(`(() => {
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem('quid-store') || 'null'); } catch {}
      const headings = [...document.querySelectorAll('h1,h2,h3')]
        .slice(0, 4).map(h => (h.textContent || '').trim()).filter(Boolean);
      const buttons = [...document.querySelectorAll('button')]
        .map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 14);
      return {
        href: location.href,
        storedActiveModule: stored?.state?.activeModule ?? null,
        headings,
        buttons,
      };
    })()`);
    console.log("PROBE:", JSON.stringify(diag, null, 2));
  }

  const TABS = [
    ["01-nevera", "Nevera"],
    ["02-mercado", "Mercado"],
    ["03-recetas", "Recetas"],
    ["04-perfiles", "Perfiles"],
    ["05-historial", "Historial"],
  ];

  console.log(`Capturando en ${OUT}`);
  for (const [file, label] of TABS) {
    const clicked = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => (b.textContent || '').trim() === ${JSON.stringify(label)});
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    await sleep(2200);
    if (!clicked) console.log(`  (no encontré el tab ${label})`);
    await shot(file);
  }

  // Historial → segmento Reportes (Fase 9)
  await evaluate(`[...document.querySelectorAll('button')]
    .find(b => (b.textContent || '').trim() === 'Reportes')?.click()`);
  await sleep(2500);
  await shot("07-reportes");

  // Diálogo de confirmación: comprueba que el conteo coincide con las filas.
  // El bug de producción decía "0 ítems" con importe válido.
  if (process.env.PROBE_CONFIRM) {
    await evaluate(`[...document.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === 'Mercado')?.click()`);
    await sleep(2500);
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => /Mercado de la semana/.test(x.textContent || ''));
      if (b) { b.click(); return true; }
      return false;
    })()`);
    await sleep(3500);
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => /^Confirmar/i.test((x.textContent || '').trim()));
      if (b) { b.click(); return true; }
      return false;
    })()`);
    await sleep(2500);
    const probe = await evaluate(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      if (!dialog) return { dialog: false };
      const text = dialog.innerText || '';
      const count = text.match(/(\\d+)\\s+ítems/);
      const money = text.match(/\\$\\s?[\\d.,]+/);
      return {
        dialog: true,
        itemsLabel: count ? Number(count[1]) : null,
        rows: dialog.querySelectorAll('li').length,
        money: money ? money[0] : null,
      };
    })()`);
    console.log("PROBE_CONFIRM:", JSON.stringify(probe));
    await shot("08-confirmar");
  }

  // ── Móvil (la app es sobre todo móvil) ──
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await evaluate(`[...document.querySelectorAll('button')]
    .find(b => (b.textContent || '').trim() === 'Nevera')?.click()`);
  await sleep(1500);
  await shot("06-movil-nevera");

  console.log("Listo.");
}

main()
  .catch((e) => {
    console.error("Falló la captura:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      ws?.close();
    } catch {
      /* nada */
    }
    chrome.kill("SIGKILL");
    await sleep(400);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* nada */
    }
  });
