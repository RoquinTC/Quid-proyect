import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Rutas de servidor que NO pueden existir en una exportación estática.
 *
 * Se mueven temporalmente fuera de src/app durante el build y se restauran en
 * el `finally`. Los respaldos viven fuera de src/app para que Next no las
 * escanee como rutas.
 *
 * - `api`: todas las rutas de API (dependen del servidor).
 * - `downloads/[file]`: sirve la APK desde el disco del servidor. Es una ruta
 *   dinámica sin `generateStaticParams`, así que `output: export` la rechaza
 *   ("export const dynamic / revalidate not configured"). En la app móvil no
 *   tiene sentido: el APK no se descarga desde sí mismo.
 */
const SERVER_ONLY_ROUTES = [
  {
    live: path.join(rootDir, 'src', 'app', 'api'),
    backup: path.join(rootDir, 'api-backup'),
    label: 'rutas API',
  },
  {
    live: path.join(rootDir, 'src', 'app', 'downloads'),
    backup: path.join(rootDir, 'downloads-backup'),
    label: 'descarga de APK',
  },
];

const nextPath = path.join(rootDir, '.next');

console.log('🏁 Iniciando proceso de compilación móvil estática...');

// Limpiar la carpeta .next para evitar conflictos con tipos de rutas autogeneradas obsoletas
if (fs.existsSync(nextPath)) {
  console.log('🧹 Limpiando directorio de compilación anterior (.next)...');
  try {
    fs.rmSync(nextPath, { recursive: true, force: true });
    console.log('✅ Directorio .next eliminado.');
  } catch (err) {
    console.warn('⚠️ No se pudo limpiar .next por completo, continuando de todos modos:', err.message);
  }
}

// Autocuración: si una compilación anterior falló y dejó respaldos, los restauramos
for (const route of SERVER_ONLY_ROUTES) {
  if (fs.existsSync(route.backup) && !fs.existsSync(route.live)) {
    console.log(`🔄 Detectado respaldo residual de ${route.label}. Restaurando...`);
    fs.renameSync(route.backup, route.live);
  }
}

const moved = [];

try {
  for (const route of SERVER_ONLY_ROUTES) {
    if (fs.existsSync(route.live)) {
      console.log(`📦 Moviendo temporalmente ${route.label} fuera de src/app...`);
      fs.renameSync(route.live, route.backup);
      moved.push(route);
    }
  }

  console.log('🚀 Ejecutando Next.js build con STATIC_EXPORT=true usando Webpack...');
  // Ejecutamos la compilación estática forzando el motor Webpack
  execSync('npx cross-env STATIC_EXPORT=true next build --webpack', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      STATIC_EXPORT: 'true',
    }
  });

  console.log('✅ Compilación estática completada exitosamente.');

} catch (error) {
  console.error('❌ Error durante la compilación:', error.message);
  process.exitCode = 1;
} finally {
  for (const route of moved) {
    if (fs.existsSync(route.backup)) {
      console.log(`🔄 Restaurando ${route.label}...`);
      fs.renameSync(route.backup, route.live);
    }
  }
  console.log('✅ Estructura del repositorio restaurada.');
}
