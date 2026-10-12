/**
 * Enlace al bot de Aura en Telegram.
 *
 * ¿POR QUÉ EXISTE ESTE ARCHIVO?
 *
 * La URL del bot estaba hardcodeada en tres componentes:
 *   - components/settings/aura-settings.tsx  (:126 y :192)
 *   - components/dashboard/dashboard-page.tsx (:253)
 *   - components/layout/quick-action-fab.tsx  (:224)
 *
 * Eso impedía probar con un bot de pruebas: en local los enlaces seguían
 * abriendo el bot de producción, con lo que cualquier prueba terminaba
 * escribiéndole al bot real (y por tanto a los datos reales).
 *
 * Ahora se configura con NEXT_PUBLIC_AURA_BOT_URL. Es NEXT_PUBLIC_ porque el
 * valor se incrusta en el bundle del cliente durante el build: cambiarlo exige
 * reconstruir la imagen, no basta con reiniciar el contenedor.
 *
 * En local:  NEXT_PUBLIC_AURA_BOT_URL=https://t.me/AuritaIA_bot
 * En el servidor se deja sin definir, y usa el bot de producción por defecto.
 */

export const DEFAULT_AURA_BOT_URL = "https://t.me/Aura_RQC_Bot";

export function getAuraBotUrl(): string {
  const configured = process.env.NEXT_PUBLIC_AURA_BOT_URL?.trim();
  if (!configured) return DEFAULT_AURA_BOT_URL;

  // Aceptar tanto "https://t.me/Bot" como sólo el nombre del bot.
  if (/^https?:\/\//i.test(configured)) return configured;
  return `https://t.me/${configured.replace(/^@/, "")}`;
}

/** Abre el chat de Aura en Telegram respetando la configuración del entorno. */
export function openAuraBot(): void {
  window.open(getAuraBotUrl(), "_blank", "noopener,noreferrer");
}
