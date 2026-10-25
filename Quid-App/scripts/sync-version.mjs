/**
 * Sincroniza la versión de la app en TODOS los lugares donde vive.
 *
 * Problema que resuelve: la versión estaba escrita a mano en cuatro sitios y se
 * desincronizaba (package.json 0.2.0, sw.js 1.0.21, build.gradle 1.0.20,
 * release-notes.json 1.0.20). Cuando `sw.js` no cambia, el service worker **no
 * detecta versión nueva** y la PWA nunca ofrece actualizar.
 *
 * Fuente única de verdad: `package.json` → `version`.
 *
 * Uso:
 *   node scripts/sync-version.mjs                      # sincroniza con la versión actual
 *   node scripts/sync-version.mjs --bump patch         # sube la versión y sincroniza
 *   node scripts/sync-version.mjs --bump minor --notes "texto|otra idea"
 *
 * Escribe:
 *   - public/sw.js            → APP_VERSION (activa la detección de actualización)
 *   - public/release-notes.json → currentVersion + entrada nueva en releases[]
 *   - public/version.json     → version + buildTime + commit (consulta en runtime)
 *   - android/app/build.gradle → versionName + versionCode
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const PKG = path.join(ROOT, "package.json");
const SW = path.join(ROOT, "public", "sw.js");
const NOTES = path.join(ROOT, "public", "release-notes.json");
const VERSION_JSON = path.join(ROOT, "public", "version.json");
const GRADLE = path.join(ROOT, "android", "app", "build.gradle");

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const bumpIndex = args.indexOf("--bump");
const bump = bumpIndex >= 0 ? args[bumpIndex + 1] : null;
const notesIndex = args.indexOf("--notes");
const notes = notesIndex >= 0 ? (args[notesIndex + 1] || "").split("|").filter(Boolean) : [];

function log(...parts) {
  if (!quiet) console.log(...parts);
}

function bumpVersion(version, kind) {
  const [major, minor, patch] = version.split(".").map((n) => Number(n) || 0);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function shortCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? "local";
  }
}

// ── 1. Versión objetivo ──────────────────────────────────────────────────────
const pkg = readJson(PKG, {});
if (!pkg.version) {
  console.error("✖ package.json no tiene version");
  process.exit(1);
}

const nextVersion = bump ? bumpVersion(pkg.version, bump) : pkg.version;
if (bump) {
  pkg.version = nextVersion;
  fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  log(`• package.json → ${nextVersion}`);
}

// ── 2. sw.js: APP_VERSION ───────────────────────────────────────────────────
if (fs.existsSync(SW)) {
  const sw = fs.readFileSync(SW, "utf8");
  const updated = sw.replace(
    /const APP_VERSION = '[^']*';/,
    `const APP_VERSION = '${nextVersion}';`,
  );
  if (updated === sw) {
    log(`= sw.js ya estaba en ${nextVersion}`);
  } else {
    fs.writeFileSync(SW, updated, "utf8");
    log(`• sw.js → ${nextVersion}`);
  }
} else {
  console.warn("⚠ no se encontró public/sw.js");
}

// ── 3. release-notes.json ───────────────────────────────────────────────────
const manifest = readJson(NOTES, { currentVersion: nextVersion, releases: [] });
manifest.currentVersion = nextVersion;
manifest.releases = Array.isArray(manifest.releases) ? manifest.releases : [];

const alreadyListed = manifest.releases.some((release) => release.version === nextVersion);
if (!alreadyListed && (notes.length > 0 || bump)) {
  manifest.releases.unshift({
    version: nextVersion,
    date: new Date().toISOString().slice(0, 10),
    title: `Quid ${nextVersion}`,
    changes:
      notes.length > 0
        ? notes
        : [`Actualización ${nextVersion} de Quid.`],
  });
  log(`• release-notes.json → entrada nueva para ${nextVersion}`);
}
writeJson(NOTES, manifest);

// ── 4. version.json (lo consulta la app en runtime) ────────────────────────
writeJson(VERSION_JSON, {
  version: nextVersion,
  buildTime: new Date().toISOString(),
  commit: shortCommit(),
  nativeVersion: null,
});
log(`• version.json → ${nextVersion}`);

// ── 5. Android: versionName + versionCode ──────────────────────────────────
if (fs.existsSync(GRADLE)) {
  const [major, minor, patch] = nextVersion.split(".").map((n) => Number(n) || 0);
  const versionCode = major * 10000 + minor * 100 + patch;
  let gradle = fs.readFileSync(GRADLE, "utf8");
  const before = gradle;
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${nextVersion}"`);
  if (gradle !== before) {
    fs.writeFileSync(GRADLE, gradle, "utf8");
    log(`• build.gradle → ${nextVersion} (code ${versionCode})`);
  } else {
    log("= build.gradle ya estaba sincronizado");
  }
} else {
  log("= no hay proyecto android, se omite build.gradle");
}

if (!quiet) console.log(`\n✔ Versión sincronizada: ${nextVersion}`);
