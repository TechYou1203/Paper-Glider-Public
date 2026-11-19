import { HttpError } from './http.js';

export interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  provider: string;
}

/**
 * Verify a Firebase ID token with Google's Identity Toolkit API.
 *
 * The API key is public by design (it ships in the web client); the ID token
 * is what proves the pilot's identity. Never trust a client-supplied UID.
 */
export async function verifyFirebaseIdToken(idToken: unknown): Promise<VerifiedFirebaseUser> {
  if (typeof idToken !== 'string' || idToken.length < 20) {
    throw new HttpError(401, 'A valid Firebase session is required.');
  }

  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, 'Firebase authentication is not configured on this server.');
  }

  let response: globalThis.Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(8000),
      }
    );
  } catch {
    throw new HttpError(503, 'Could not reach Firebase to verify this session.');
  }

  if (!response.ok) {
    throw new HttpError(401, 'Invalid or expired Firebase session.');
  }

  const data = await response.json().catch(() => null) as any;
  const user = data?.users?.[0];
  if (!user?.localId) {
    throw new HttpError(401, 'Invalid or expired Firebase session.');
  }

  const providerId = user.providerUserInfo?.[0]?.providerId;
  return {
    uid: String(user.localId),
    email: typeof user.email === 'string' ? user.email.trim().toLowerCase() : null,
    emailVerified: Boolean(user.emailVerified),
    provider: providerId === 'google.com' ? 'google' : 'firebase',
  };
}
