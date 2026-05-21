export function isSecureCookieEnabled(): boolean {
  if (process.env.AUTH_COOKIE_SECURE) {
    return process.env.AUTH_COOKIE_SECURE === "true";
  }

  return process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
}

export const SESSION_COOKIE_NAME = "next-auth.session-token";
