package app.quid.finance;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Selector de sonido de notificación para los recordatorios de medicación.
 *
 * ¿Por qué existe?
 * Android guarda el sonido en el CANAL de notificación (API 26+) y el canal no
 * se puede modificar después de crearlo. Para que el usuario pueda elegir el
 * sonido —incluido el selector del propio teléfono— hace falta:
 *   1. abrir el selector del sistema (ACTION_RINGTONE_PICKER) y quedarse con la URI,
 *   2. crear un canal NUEVO con esa URI (id distinto, porque el anterior es inmutable),
 *   3. borrar los canales viejos para que no queden duplicados en Ajustes.
 *
 * El plugin solo hace la parte nativa; el cliente decide el id del canal y
 * persiste la preferencia (el sonido es por dispositivo, no por cuenta).
 */
@CapacitorPlugin(name = "QuidDoseSound")
public class QuidDoseSoundPlugin extends Plugin {

    private Ringtone previewRingtone;

    /** Abre el selector de tonos del sistema y devuelve { uri, title, silent }. */
    @PluginMethod
    public void pickSound(PluginCall call) {
        Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, ringtoneType(call.getString("type", "notification")));
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, true);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, Settings.System.DEFAULT_NOTIFICATION_URI);

        String currentUri = call.getString("currentUri");
        if (currentUri != null && !currentUri.isEmpty()) {
            try {
                intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(currentUri));
            } catch (Exception ignored) {
                // URI inválida: se abre sin selección previa.
            }
        }

        startActivityForResult(call, intent, "soundPickerResult");
    }

    @ActivityCallback
    private void soundPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Selección cancelada");
            return;
        }

        Uri picked;
        try {
            picked = result.getData().getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
        } catch (Exception error) {
            call.reject("No se pudo leer el sonido elegido");
            return;
        }

        JSObject payload = new JSObject();
        if (picked == null) {
            // El usuario eligió "Silencio".
            payload.put("uri", "");
            payload.put("title", "Silencio");
            payload.put("silent", true);
            call.resolve(payload);
            return;
        }

        String title = resolveTitle(picked);
        payload.put("uri", picked.toString());
        payload.put("title", title);
        payload.put("silent", false);
        call.resolve(payload);
    }

    /**
     * Crea el canal con el sonido indicado.
     * `soundUri` puede ser una URI del sistema, `android.resource://...` o "" (silencio).
     */
    @PluginMethod
    public void applyChannel(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(); // antes de Android 8 el sonido va en cada notificación
            return;
        }

        String channelId = call.getString("channelId");
        if (channelId == null || channelId.isEmpty()) {
            call.reject("channelId es obligatorio");
            return;
        }
        String name = call.getString("name", "Recordatorios de medicación");
        String description = call.getString("description", "Avisos para tomar tus medicamentos");
        String soundUri = call.getString("soundUri", "");

        NotificationManager manager =
            (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            call.reject("NotificationManager no disponible");
            return;
        }

        NotificationChannel channel =
            new NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(description);
        channel.enableVibration(true);
        channel.enableLights(true);

        if (soundUri != null && !soundUri.isEmpty()) {
            AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            // "default" = sonido de notificación configurado en el teléfono.
            Uri sound = "default".equals(soundUri)
                ? Settings.System.DEFAULT_NOTIFICATION_URI
                : Uri.parse(soundUri);
            try {
                channel.setSound(sound, attributes);
            } catch (Exception error) {
                // Si la URI no sirve, se deja el sonido por defecto del sistema.
                channel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attributes);
            }
        }
        // soundUri vacío ⇒ canal silencioso (setSound no se llama).

        manager.createNotificationChannel(channel);

        JSObject payload = new JSObject();
        payload.put("channelId", channelId);
        payload.put("soundUri", soundUri == null ? "" : soundUri);
        call.resolve(payload);
    }

    /** Borra un canal (para no acumular canales al cambiar de sonido). */
    @PluginMethod
    public void deleteChannel(PluginCall call) {
        String channelId = call.getString("channelId");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && channelId != null && !channelId.isEmpty()) {
            NotificationManager manager =
                (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.deleteNotificationChannel(channelId);
        }
        call.resolve();
    }

    /** Lista los canales cuyo id empieza por `prefix` (limpieza de versiones viejas). */
    @PluginMethod
    public void listChannels(PluginCall call) {
        JSObject payload = new JSObject();
        com.getcapacitor.JSArray ids = new com.getcapacitor.JSArray();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager =
                (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            String prefix = call.getString("prefix", "");
            if (manager != null) {
                for (NotificationChannel channel : manager.getNotificationChannels()) {
                    if (channel.getId().startsWith(prefix)) ids.put(channel.getId());
                }
            }
        }
        payload.put("channels", ids);
        call.resolve(payload);
    }

    /** Reproduce el sonido para que el usuario lo escuche antes de guardarlo. */
    @PluginMethod
    public void preview(PluginCall call) {
        stopPreview();
        String soundUri = call.getString("soundUri", "");
        Uri uri = (soundUri == null || soundUri.isEmpty())
            ? Settings.System.DEFAULT_NOTIFICATION_URI
            : Uri.parse(soundUri);
        try {
            previewRingtone = RingtoneManager.getRingtone(getContext(), uri);
        } catch (Exception error) {
            previewRingtone = null;
        }
        if (previewRingtone == null) {
            call.reject("No se pudo reproducir el sonido");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            previewRingtone.setVolume(1f);
        }
        previewRingtone.play();
        call.resolve();
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        stopPreview();
        call.resolve();
    }

    private void stopPreview() {
        if (previewRingtone != null) {
            try {
                if (previewRingtone.isPlaying()) previewRingtone.stop();
            } catch (Exception ignored) {
                // Nada que detener.
            }
            previewRingtone = null;
        }
    }

    private String resolveTitle(Uri uri) {
        try {
            Ringtone ringtone = RingtoneManager.getRingtone(getContext(), uri);
            if (ringtone != null) {
                String title = ringtone.getTitle(getContext());
                if (title != null && !title.isEmpty()) return title;
            }
        } catch (Exception ignored) {
            // Se devuelve la URI como título.
        }
        return uri.toString();
    }

    private int ringtoneType(String type) {
        if ("alarm".equalsIgnoreCase(type)) return RingtoneManager.TYPE_ALARM;
        if ("ringtone".equalsIgnoreCase(type)) return RingtoneManager.TYPE_RINGTONE;
        return RingtoneManager.TYPE_NOTIFICATION;
    }

    @Override
    protected void handleOnDestroy() {
        stopPreview();
        super.handleOnDestroy();
    }
}
