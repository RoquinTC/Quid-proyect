package app.quid.finance;

import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "QuidGoogleAuth")
public class QuidGoogleAuthPlugin extends Plugin {
    private GoogleSignInClient client;

    @Override
    public void load() {
        String webClientId = getContext().getString(R.string.google_web_client_id);
        if (webClientId == null || webClientId.isBlank()) {
            return;
        }

        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(webClientId)
            .requestEmail()
            .build();
        client = GoogleSignIn.getClient(getContext(), options);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (client == null) {
            call.reject("Google Login aun no esta configurado para Android");
            return;
        }

        Intent signInIntent = client.getSignInIntent();
        startActivityForResult(call, signInIntent, "handleSignInResult");
    }

    @ActivityCallback
    private void handleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            String idToken = account.getIdToken();
            if (idToken == null || idToken.isBlank()) {
                call.reject("Google no devolvio un token de identidad");
                return;
            }

            JSObject response = new JSObject();
            response.put("idToken", idToken);
            response.put("email", account.getEmail());
            response.put("name", account.getDisplayName());
            response.put("photoUrl", account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);
            call.resolve(response);
        } catch (ApiException error) {
            call.reject("No se pudo iniciar sesion con Google", String.valueOf(error.getStatusCode()));
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        if (client == null) {
            call.resolve();
            return;
        }

        client.signOut()
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(error -> call.reject("No se pudo cerrar Google", error));
    }
}
