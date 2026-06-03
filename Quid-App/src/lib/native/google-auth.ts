import { registerPlugin } from "@capacitor/core";
import { isNativeAndroid } from "./biometric";

interface QuidGoogleAuthPlugin {
  signIn(): Promise<{
    idToken: string;
    email?: string;
    name?: string;
    photoUrl?: string;
  }>;
  signOut(): Promise<void>;
}

const QuidGoogleAuth = registerPlugin<QuidGoogleAuthPlugin>("QuidGoogleAuth");

export async function signInWithNativeGoogle() {
  if (!isNativeAndroid()) {
    throw new Error("Google nativo solo esta disponible en Android");
  }
  return QuidGoogleAuth.signIn();
}

export async function signOutFromNativeGoogle() {
  if (!isNativeAndroid()) return;
  await QuidGoogleAuth.signOut();
}
