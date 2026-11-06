package app.quid.finance;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

/**
 * F-01 · Lectura de SMS para la bandeja de capturas.
 *
 * Solo LEE la bandeja de entrada del teléfono; no envía, no borra y no
 * modifica nada. El permiso se pide de forma explícita en el momento, y la
 * función es opt-in: si el usuario no activa la captura por SMS, este plugin
 * nunca se invoca.
 *
 * Se devuelve el texto crudo; la interpretación (monto, comercio, tipo) se
 * hace en el servidor con el mismo parser que usa la bandeja, para que la
 * lógica viva en un solo lugar y se pueda probar sin dispositivo.
 */
@CapacitorPlugin(
    name = "QuidSms",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS })
    }
)
public class QuidSmsPlugin extends Plugin {
    private static final String SMS_PERMISSION = "sms";

    @PluginMethod
    public void readRecent(PluginCall call) {
        if (getPermissionState(SMS_PERMISSION) != PermissionState.GRANTED) {
            requestPermissionForAlias(SMS_PERMISSION, call, "readRecentPermissionCallback");
            return;
        }
        readMessages(call);
    }

    @PermissionCallback
    private void readRecentPermissionCallback(PluginCall call) {
        if (getPermissionState(SMS_PERMISSION) == PermissionState.GRANTED) {
            readMessages(call);
        } else {
            call.reject("Quid necesita permiso para leer los SMS y armar la bandeja");
        }
    }

    /** Devuelve los SMS recibidos en los últimos `sinceDays` días. */
    private void readMessages(PluginCall call) {
        Integer limitValue = call.getInt("limit", 50);
        Integer daysValue = call.getInt("sinceDays", 7);
        int limit = limitValue == null ? 50 : Math.max(1, Math.min(limitValue, 500));
        int sinceDays = daysValue == null ? 7 : Math.max(1, Math.min(daysValue, 90));

        long since = System.currentTimeMillis() - (sinceDays * 24L * 60L * 60L * 1000L);

        JSArray messages = new JSArray();
        Cursor cursor = null;

        try {
            Uri inbox = Telephony.Sms.Inbox.CONTENT_URI;
            String[] projection = {
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
            };

            cursor = getContext().getContentResolver().query(
                inbox,
                projection,
                Telephony.Sms.DATE + " >= ?",
                new String[] { String.valueOf(since) },
                Telephony.Sms.DATE + " DESC LIMIT " + limit
            );

            if (cursor != null) {
                int addressIndex = cursor.getColumnIndex(Telephony.Sms.ADDRESS);
                int bodyIndex = cursor.getColumnIndex(Telephony.Sms.BODY);
                int dateIndex = cursor.getColumnIndex(Telephony.Sms.DATE);

                while (cursor.moveToNext()) {
                    String body = bodyIndex >= 0 ? cursor.getString(bodyIndex) : null;
                    if (body == null || body.trim().isEmpty()) continue;

                    JSONObject item = new JSONObject();
                    item.put("address", addressIndex >= 0 ? cursor.getString(addressIndex) : null);
                    item.put("body", body);
                    item.put("date", dateIndex >= 0 ? cursor.getLong(dateIndex) : 0L);
                    messages.put(item);
                }
            }

            JSObject result = new JSObject();
            result.put("messages", messages);
            call.resolve(result);
        } catch (SecurityException e) {
            call.reject("Sin permiso para leer los SMS");
        } catch (Exception e) {
            call.reject("No se pudieron leer los SMS: " + e.getMessage());
        } finally {
            if (cursor != null) cursor.close();
        }
    }
}
