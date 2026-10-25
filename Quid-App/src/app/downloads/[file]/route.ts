import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

/**
 * Descarga pública de la APK.
 *
 * El repositorio pasó a ser privado, así que el enlace de GitHub Releases exige
 * iniciar sesión y deja de servir para compartir la app. Este endpoint sirve el
 * APK desde el propio servidor, con URL estable:
 *
 *   https://quid.roquintc.app/downloads/Quid.apk
 *
 * Los archivos viven fuera de la imagen, en un directorio montado
 * (`DOWNLOADS_DIR`, por defecto `/app/downloads`), para no meter 15 MB en cada
 * build de Docker.
 */

const MIME_APK = "application/vnd.android.package-archive";

function downloadsDir(): string {
  return process.env.DOWNLOADS_DIR || "/app/downloads";
}

/** Solo se sirven archivos .apk con nombre simple: nada de rutas ni traversal. */
function isSafeApkName(file: string): boolean {
  return /^[A-Za-z0-9._-]+\.apk$/i.test(file) && !file.includes("..");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;

  if (!isSafeApkName(file)) {
    return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  }

  const target = path.join(downloadsDir(), file);

  let size: number;
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("no es archivo");
    size = info.size;
  } catch {
    return NextResponse.json(
      { error: "APK no disponible", file },
      { status: 404 },
    );
  }

  const stream = Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>;

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": MIME_APK,
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${file}"`,
      // Cambia con cada nueva versión que se suba al servidor.
      "Cache-Control": "public, max-age=300",
    },
  });
}
