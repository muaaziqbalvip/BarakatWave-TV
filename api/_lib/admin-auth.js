import { authenticateAdmin } from "./adminauth.js";

/**
 * BarakatWave TV — Admin gate shared by the analytics / sync / github-push routes
 * -----------------------------------------------------------------------------
 * Previously this file only accepted a Firebase ID token, which meant an owner
 * who signed in with the Owner PIN (the one credential that always works when the
 * current domain is not yet listed in Firebase "Authorized domains") could open
 * the panel but every analytics/sync call answered
 * `403 Administrator authentication required`.
 *
 * Now both credential styles are accepted, in this order:
 *   1. Owner PIN session  (`bwp_...` HMAC token from /api/panel admin/pin-login)
 *   2. Firebase ID token  (Google or Email/Password sign-in)
 *   3. Server automation token (env BARAKATWAVE_ADMIN_TOKEN)
 *
 * Every path verifies the token server-side; a client-supplied UID or email is
 * never trusted.
 */
export async function isFirebaseAdmin(req) {
  try {
    const result = await authenticateAdmin(req);
    return Boolean(result && result.ok);
  } catch {
    return false;
  }
}

/** Same check, but returns the identity so handlers can audit who acted. */
export async function resolveAdmin(req) {
  try {
    const result = await authenticateAdmin(req);
    if (result && result.ok) return result;
  } catch {
    // fall through to unauthenticated
  }
  return null;
}
