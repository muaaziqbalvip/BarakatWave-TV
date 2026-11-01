// Verify the ID token with Firebase; never trust a client-supplied UID or email.
export async function isFirebaseAdmin(req) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(String(req.headers?.authorization || ""));
  if (!match) return false;
  const key = process.env.FIREBASE_API_KEY || "AIzaSyB1aWw27UEteaspMte4wTp_nUWEf07FqwQ";
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: match[1] }), signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return false;
    const user = (await response.json()).users?.[0];
    if (!user?.localId || user.disabled) return false;
    if (user.emailVerified && user.email?.toLowerCase() === "muaaziqbal.vip@gmail.com") return true;
    if (!/^[A-Za-z0-9_-]+$/.test(user.localId)) return false;
    const db = (process.env.FIREBASE_DATABASE_URL || "https://barakatwave-tv-default-rtdb.firebaseio.com").replace(/\/+$/, "");
    const adminResponse = await fetch(`${db}/admins/${user.localId}.json?auth=${encodeURIComponent(match[1])}`, { signal: AbortSignal.timeout(5000) });
    return adminResponse.ok && (await adminResponse.json()) === true;
  } catch {
    return false;
  }
}
