# App móvil: bloqueo, arranque sin conexión y publicación del APK

> Complementa `MODULO_SALUD_TOMAS_IMPLEMENTACION.md`. Aquí está lo que se tocó del
> sistema de bloqueo, el blindaje de arranque y la compilación automática del APK.

Fecha: 2026-10-24

Decisión de distribución: **uso personal/familiar, sideload**. No va a Play Store,
así que `USE_EXACT_ALARM` se mantiene (es la vía limpia para alarmas exactas sin
pedir permiso especial al usuario).

---

## 1. Bloqueo al volver a la app

### 1.1 El problema real: temporizadores que no corren

El código anterior usaba un `setTimeout` de 5 minutos para decidir si bloquear al
regresar. Cuando Android suspende el WebView, los temporizadores de JavaScript
**no se ejecutan**: el "temporizador de gracia" nunca vencía y el resultado era
impredecible (a veces no bloqueaba, a veces bloqueaba de más).

Ahora se guarda una **marca de tiempo** al pasar a segundo plano y se compara al
volver. Es correcto sin importar cuánto tiempo estuvo el proceso pausado.

### 1.2 Tiempo de gracia configurable

| Antes | Ahora |
|---|---|
| 5 minutos fijos en el código | Ajustable: 1 / 5 / 15 / 30 / 60 min / 4 h / **Nunca** |

- Nuevo campo `UserSettings.lockGraceMinutes` (`Int @default(15)`), en los tres esquemas.
- `-1` significa "nunca bloquear al volver".
- UI: **Ajustes → Seguridad → Tiempo antes de bloquear**.
- `GET /api/auth/security/status` devuelve `lockGraceMinutes`; `PUT /api/settings` lo acepta.
- El valor se cachea en `localStorage` (`quid:security-status`) para decidir **sin red**.

### 1.3 "El PIN no servía, solo la huella"

Era un bug real y la causa era concreta: la pantalla de bloqueo leía
`pinEnabled` / `biometricEnabled` del **JWT de la sesión**. Si activabas el PIN
después de iniciar sesión, el token seguía diciendo `pinEnabled: false`, así que:

- nunca se mostraba el teclado del PIN,
- y el botón "Usar PIN" no aparecía (solo se pinta si `pinEnabled && biometricEnabled`).

Arreglos:

1. La pantalla de bloqueo consulta `/api/auth/security/status` (la verdad) y usa el
   JWT solo como respaldo.
2. Si existe un hash de PIN cacheado, el PIN se ofrece aunque el servidor no responda.
3. La elección inicial de método se hace **una sola vez** (antes, cuando llegaba el
   estado del servidor, `useEffect` devolvía al usuario a huella y le cerraba el PIN).
4. El hash del PIN se cachea al abrir la pantalla de bloqueo, no solo tras un
   desbloqueo exitoso, para que la verificación sin conexión funcione desde el inicio.
5. Mensajes de error distintos según la causa:
   - `PIN incorrecto` (sí se pudo verificar),
   - `Verifica el PIN una vez con internet…` (no hay hash cacheado),
   - `No se pudo verificar el PIN…` (fallo de la comparación).

---

## 2. Arranque sin conexión (blindaje)

El APK carga la web del servidor (`server.url`), así que sin red el WebView mostraba
su propia página de error: pantalla en blanco sin explicación.

Ahora hay una **página local** que se muestra cuando el servidor no responde:

- `capacitor.config.json` → `server.errorPath: "offline.html"` (soporte nativo de Capacitor).
- `public/offline.html` (y copia en `android/app/src/main/assets/public/offline.html`).
- Explica qué sigue funcionando: **los recordatorios de medicación y los botones de la
  notificación** (Tomar / Omitir / En 5 min) siguen operando, y al volver la conexión se
  sincroniza todo.
- El botón **Reintentar** comprueba el servidor con un `fetch` y navega a la app real.
  Antes hacía `location.reload()`, que en la página de error vuelve a caer en la misma
  página (bucle inútil).
- El `service worker` (`public/sw.js`) ya usaba `/offline.html` como respaldo de
  navegación; ahora esa página sí permite recuperarse.

---

## 3. Compilar el APK desde GitHub

Sí se puede: `Quid-App/android/` está versionado (incluye el wrapper de Gradle), así que
GitHub Actions compila sin depender de tu máquina.

Workflow: `.github/workflows/android-apk.yml` (en la **raíz del repo**, junto a `Quid-App/`).

### Cómo se dispara

| Acción | Resultado |
|---|---|
| Push a `main` (con cambios en `Quid-App/**`) | Compila y deja la APK como **artefacto** (90 días) |
| Crear un tag `v1.0.0` | Además publica un **Release** con la APK adjunta |
| Manual (Actions → APK Android → Run workflow) | Igual que el push |

### Link de descarga estable

```
https://github.com/<usuario>/<repo>/releases/latest/download/Quid.apk
```

Ese link siempre apunta al último Release: se lo puedes mandar a tu pareja y descarga
siempre la versión más reciente.

### Qué hace el workflow

1. `npm ci --legacy-peer-deps` — necesario porque `android/capacitor.settings.gradle`
   apunta a `../node_modules/@capacitor/*/android`.
2. JDK 21 + Android SDK + caché de Gradle.
3. `./gradlew assembleDebug`.
4. Renombra a `Quid.apk`, lo sube como artefacto y (en tags) lo adjunta al Release.

### Antes de que funcione

- El APK debe estar **commiteado con el plugin nuevo**: `QuidDoseSoundPlugin.java`,
  `MainActivity.java` actualizado, `res/raw/*.wav` y el manifiesto.
- `npx cap sync android` **no** se ejecuta en CI a propósito: `out/` está en `.gitignore`.
  Los assets nativos que importan (plugin y sonidos) ya están versionados.
- Al instalar una actualización encima de la anterior se conservan los datos **siempre
  que la firma sea la misma**. Las builds *debug* usan la clave de depuración, así que
  mientras todas vengan de este workflow, actualizar es seguro.
- Si algún día quieres build *release* firmada: genera un keystore, guárdalo en
  *Secrets* (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) y
  añade el paso de `signingConfig` en `android/app/build.gradle`.

---

## 4. Verificación hecha en esta sesión

- `npx tsc --noEmit` → 0 errores.
- `eslint` sobre los archivos tocados → sin avisos (se corrigió un ref escrito en render).
- `next build` (producción) → exit 0.
- Pruebas del módulo Salud: 41 pasan.
- Esquemas Prisma: los tres válidos tras añadir `lockGraceMinutes`.

---

## 5. Versiones y detección de actualización

### 5.1 El problema: la versión vivía en cuatro sitios

| Archivo | Antes |
|---|---|
| `package.json` | `0.2.0` |
| `public/sw.js` (`APP_VERSION`) | `1.0.21` |
| `public/release-notes.json` (`currentVersion`) | `1.0.20` |
| `android/app/build.gradle` | `versionName "1.0.20"`, `versionCode 20` |

Y aquí está lo importante: **la PWA ya tenía todo el mecanismo de actualización**
(`use-service-worker` detecta el worker nuevo, `UpdateNotification` ofrece "Aplicar",
y hay un aviso de "Quid se actualizó mientras no estabas" con las novedades). Pero
ese mecanismo se dispara cuando cambia `APP_VERSION` en `sw.js`. Al editarlo a mano
(y olvidarlo), la app **no detectaba nada**.

### 5.2 Solución: `scripts/sync-version.mjs`

`package.json` pasa a ser la **fuente única de verdad**. El script:

1. escribe `APP_VERSION` en `public/sw.js` → activa la detección de actualización;
2. actualiza `currentVersion` y añade la entrada nueva en `public/release-notes.json`
   (lo que se muestra en el aviso de novedades);
3. regenera `public/version.json` (versión, fecha de build, commit);
4. sincroniza `versionName` y `versionCode` en `android/app/build.gradle`.

```bash
npm run version:sync                                   # sincroniza
node scripts/sync-version.mjs --bump patch --notes "a|b|c"   # sube y sincroniza
```

Además está enganchado como `prebuild`, así que **cada `npm run build` (y cada build
de Docker) sincroniza la versión sin intervención**.

### 5.3 Qué ve el usuario

- **Ajustes → pie de la tarjeta de la app**: `Versión web 1.0.22` y, en Android,
  `APK 1.0.22 (10022)` leído con `App.getInfo()`.
- Botón **Buscar actualización** (ya existía) que consulta el manifiesto de novedades.
- Aviso flotante **"Actualización disponible · Aplicar"** cuando hay worker nuevo.
- Aviso **"Quid se actualizó mientras no estabas"** con la lista de novedades.

### 5.4 Versión actual

`1.0.22` — `versionCode 10022`. Contiene todo el módulo de Salud y los arreglos de
bloqueo y arranque sin conexión.

