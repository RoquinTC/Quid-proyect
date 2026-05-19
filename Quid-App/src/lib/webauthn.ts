import {
  generateRegistrationOptions as _generateRegistrationOptions,
  verifyRegistrationResponse as _verifyRegistrationResponse,
  generateAuthenticationOptions as _generateAuthenticationOptions,
  verifyAuthenticationResponse as _verifyAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type VerifyRegistrationResponseOpts,
  type GenerateAuthenticationOptionsOpts,
  type VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';

/**
 * Determine the Relying Party ID dynamically from request headers.
 * Supports both localhost and production domains.
 */
export function getRpId(request: Request): string {
  const host = request.headers.get('host') || 'localhost:3000';
  // Strip port number for RP ID
  const rpId = host.split(':')[0];
  return rpId;
}

/**
 * Determine the origin from request headers.
 */
export function getOrigin(request: Request): string {
  const protocol = request.headers.get('x-forwarded-proto') || 
    (request.headers.get('host')?.startsWith('localhost') ? 'http' : 'https');
  const host = request.headers.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}

const RP_NAME = 'Quid';

/**
 * Generate WebAuthn registration options for a user.
 */
export function generateRegistrationOptions(
  request: Request,
  userId: string,
  userEmail: string,
  userName: string,
  existingCredentialIds: string[] = [],
) {
  const rpId = getRpId(request);

  const opts: GenerateRegistrationOptionsOpts = {
    rpName: RP_NAME,
    rpID: rpId,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    userDisplayName: userName,
    // Prefer platform authenticator (fingerprint/face) for convenience
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
    },
    // Exclude existing credentials so the user doesn't register the same device twice
    excludeCredentials: existingCredentialIds.map((id) => ({
      id: id,
      type: 'public-key' as const,
    })),
  };

  return _generateRegistrationOptions(opts);
}

/**
 * Verify a WebAuthn registration response.
 */
export function verifyRegistrationResponse(
  request: Request,
  credential: any,
  expectedChallenge: string,
) {
  const rpId = getRpId(request);
  const origin = getOrigin(request);

  const opts: VerifyRegistrationResponseOpts = {
    response: credential,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
  };

  return _verifyRegistrationResponse(opts);
}

/**
 * Generate WebAuthn authentication options.
 */
export function generateAuthenticationOptions(
  request: Request,
  existingCredentialIds: string[] = [],
  allowUsernameless: boolean = false,
) {
  const rpId = getRpId(request);

  const opts: GenerateAuthenticationOptionsOpts = {
    rpID: rpId,
    // For usernameless (discoverable) credentials, we MUST require user verification
    // and NOT restrict to specific allowCredentials — the browser will present
    // all discoverable credentials registered for this RP ID.
    userVerification: allowUsernameless ? 'required' : 'preferred',
    ...(existingCredentialIds.length > 0
      ? {
          allowCredentials: existingCredentialIds.map((id) => ({
            id: id,
            type: 'public-key' as const,
          })),
        }
      : {}),
  };

  return _generateAuthenticationOptions(opts);
}

/**
 * Verify a WebAuthn authentication response.
 */
export function verifyAuthenticationResponse(
  request: Request,
  credential: any,
  expectedChallenge: string,
  credentialId: string,
  credentialPublicKey: string,
  credentialCounter: number,
) {
  const rpId = getRpId(request);
  const origin = getOrigin(request);

  const opts: VerifyAuthenticationResponseOpts = {
    response: credential,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    credential: {
      id: credentialId,
      publicKey: Buffer.from(credentialPublicKey, 'base64url'),
      counter: credentialCounter,
    },
    requireUserVerification: false,
  };

  return _verifyAuthenticationResponse(opts);
}

// ─── In-memory challenge store (simple, server-side only) ───
// In production, you'd use Redis or a DB. For this app with a single
// SQLite DB and limited concurrent users, an in-memory Map is fine.

const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function storeChallenge(userId: string, challenge: string): void {
  challengeStore.set(userId, {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
}

export function getChallenge(userId: string): string | null {
  const entry = challengeStore.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    challengeStore.delete(userId);
    return null;
  }
  return entry.challenge;
}

export function deleteChallenge(userId: string): void {
  challengeStore.delete(userId);
}

// Cleanup expired challenges periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of challengeStore) {
      if (now > entry.expiresAt) {
        challengeStore.delete(key);
      }
    }
  }, 60_000);
}
