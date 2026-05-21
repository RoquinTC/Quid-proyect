const WEBAUTHN_LOGIN_TOKEN_TTL_MS = 2 * 60 * 1000;

interface WebAuthnLoginToken {
  userId: string;
  expiresAt: number;
}

const globalForWebAuthnTokens = globalThis as typeof globalThis & {
  __quidWebAuthnLoginTokens?: Map<string, WebAuthnLoginToken>;
};

const loginTokens =
  globalForWebAuthnTokens.__quidWebAuthnLoginTokens ??
  new Map<string, WebAuthnLoginToken>();

globalForWebAuthnTokens.__quidWebAuthnLoginTokens = loginTokens;

function cleanupExpiredTokens(now = Date.now()) {
  for (const [token, entry] of loginTokens) {
    if (now > entry.expiresAt) {
      loginTokens.delete(token);
    }
  }
}

export function createWebAuthnLoginToken(userId: string): string {
  cleanupExpiredTokens();

  const token = crypto.randomUUID();
  loginTokens.set(token, {
    userId,
    expiresAt: Date.now() + WEBAUTHN_LOGIN_TOKEN_TTL_MS,
  });

  return token;
}

export function consumeWebAuthnLoginToken(token: string, userId: string): boolean {
  cleanupExpiredTokens();

  const entry = loginTokens.get(token);
  loginTokens.delete(token);

  if (!entry) return false;
  if (entry.userId !== userId) return false;
  if (Date.now() > entry.expiresAt) return false;

  return true;
}
