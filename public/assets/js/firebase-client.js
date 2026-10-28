/**
 * BarakatWave Live TV — Firebase 13.1.0 Auth + Realtime Database + Analytics Client
 * Supports BOTH:
 *   1) Google Sign-In (GoogleAuthProvider)
 *   2) Gmail / Email + Password Sign Up, Sign In & Password Reset
 * Connected to Firebase Realtime Database (barakatwave-tv).
 */

import {
  initializeApp,
  getApps,
  getApp,
  getAnalytics,
  isAnalyticsSupported,
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signOut,
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  onValue
} from "../vendor/firebase-sdk.js";

// Official Firebase 13.1.0 Configuration for BarakatWave-TV
export const firebaseConfig = {
  apiKey: "AIzaSyB1aWw27UEteaspMte4wTp_nUWEf07FqwQ",
  authDomain: "barakatwave-tv.firebaseapp.com",
  databaseURL: "https://barakatwave-tv-default-rtdb.firebaseio.com",
  projectId: "barakatwave-tv",
  storageBucket: "barakatwave-tv.firebasestorage.app",
  messagingSenderId: "724831605362",
  appId: "1:724831605362:web:989e6266699b17c40f28eb",
  measurementId: "G-G60CPES7S2"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Safely initialize Firebase Analytics in supported browser contexts
isAnalyticsSupported()
  .then((yes) => {
    if (yes) getAnalytics(app);
  })
  .catch(() => {});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const LOCAL_STORE_PREFIX = "bw_rtdb_cache_";
const PREVIEW_USER_KEY = "bw_preview_session_user";

// Handle Google Redirect result if mobile browser fell back to redirect
getRedirectResult(auth).catch(() => {});

export function isSandboxPreviewHost() {
  const h = window.location.hostname;
  return h.endsWith(".e2b.app") || h === "localhost" || h === "127.0.0.1";
}

/**
 * Subscribe to Auth State (merges real Firebase Auth user with preview fallback session if active)
 */
const previewListeners = new Set();

export function subscribeAuth(callback) {
  let latestFirebaseUser = null;

  const notify = () => {
    if (latestFirebaseUser) {
      callback(latestFirebaseUser);
      return;
    }
    const previewRaw = localStorage.getItem(PREVIEW_USER_KEY);
    if (previewRaw) {
      try {
        callback(JSON.parse(previewRaw));
        return;
      } catch {
        localStorage.removeItem(PREVIEW_USER_KEY);
      }
    }
    callback(null);
  };

  previewListeners.add(notify);
  const unsub = onAuthStateChanged(auth, (fbUser) => {
    latestFirebaseUser = fbUser;
    if (fbUser) {
      localStorage.removeItem(PREVIEW_USER_KEY);
    }
    notify();
  });

  return () => {
    previewListeners.delete(notify);
    unsub();
  };
}

export async function loginWithGoogle() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserProfileInRtdb(cred.user, "google");
    return { ok: true, user: cred.user };
  } catch (err) {
    const code = err?.code || "";
    if (code === "auth/popup-blocked") {
      await signInWithRedirect(auth, googleProvider);
      return { ok: true, redirecting: true };
    }
    return {
      ok: false,
      code,
      error: formatAuthError(err)
    };
  }
}

export async function registerWithEmailPassword(displayName, email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const cleanName = String(displayName || email.split("@")[0]).trim();
    if (cleanName) {
      await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
    }
    await ensureUserProfileInRtdb(
      { ...cred.user, uid: cred.user.uid, email: cred.user.email, displayName: cleanName },
      "password"
    );
    return { ok: true, user: cred.user };
  } catch (err) {
    return { ok: false, code: err?.code || "", error: formatAuthError(err) };
  }
}

export async function loginWithEmailPassword(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await ensureUserProfileInRtdb(cred.user, "password");
    return { ok: true, user: cred.user };
  } catch (err) {
    return { ok: false, code: err?.code || "", error: formatAuthError(err) };
  }
}

export async function resetUserPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { ok: true };
  } catch (err) {
    return { ok: false, code: err?.code || "", error: formatAuthError(err) };
  }
}

/**
 * Only offered on sandbox/localhost preview domains if Firebase Console hasn't had
 * the temporary preview domain added yet — lets owner test full dashboard immediately!
 */
export async function startPreviewSession({ name, email, asAdmin = false }) {
  const cleanEmail = String(email || "viewer@barakatwave.tv").trim().toLowerCase();
  const uid = "usr_" + btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  const mockUser = {
    uid,
    email: cleanEmail,
    displayName: String(name || cleanEmail.split("@")[0]).trim(),
    photoURL: "",
    isPreviewSession: true,
    isAdminHint: Boolean(asAdmin || cleanEmail === "muaaziqbal.vip@gmail.com")
  };
  localStorage.setItem(PREVIEW_USER_KEY, JSON.stringify(mockUser));
  await ensureUserProfileInRtdb(mockUser, "preview");
  for (const fn of previewListeners) fn();
  return { ok: true, user: mockUser };
}

export async function logoutUser() {
  localStorage.removeItem(PREVIEW_USER_KEY);
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
  for (const fn of previewListeners) fn();
}

function formatAuthError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect Gmail/Email or Password. Please check your credentials or create a new account.";
    case "auth/email-already-in-use":
      return "This email is already registered! Switch to the 'Sign In' tab or login with Google.";
    case "auth/weak-password":
      return "Password should be at least 6 characters long.";
    case "auth/invalid-email":
      return "Please enter a valid Gmail or email address.";
    case "auth/unauthorized-domain":
      return `Domain (${window.location.hostname}) needs to be added in Firebase Console -> Authentication -> Settings -> Authorized domains (add barakatwave.vercel.app).`;
    case "auth/operation-not-allowed":
      return "Enable 'Google' and 'Email/Password' Sign-in providers in Firebase Console -> Authentication -> Sign-in method.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed before completing login.";
    default:
      return err?.message || "Authentication failed. Please try again.";
  }
}

/**
 * Realtime Database Read/Write Helpers with instant local cache + server API mirror
 */
export async function dbRead(path, fallback = null) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  try {
    const snap = await withTimeout(get(ref(db, clean)), 4500);
    if (snap && snap.exists()) {
      const val = snap.val();
      saveLocalCache(clean, val);
      return val;
    }
  } catch {
    // Fallback to cached state if RTDB rules not published yet
  }
  const cached = loadLocalCache(clean);
  return cached !== undefined ? cached : fallback;
}

export function dbWatch(path, callback, fallback = null) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  let emitted = false;
  const cached = loadLocalCache(clean);
  if (cached !== undefined) {
    emitted = true;
    callback(cached);
  }

  let unsub = () => {};
  try {
    unsub = onValue(
      ref(db, clean),
      (snap) => {
        if (snap.exists()) {
          const val = snap.val();
          saveLocalCache(clean, val);
          emitted = true;
          callback(val);
        } else if (!emitted) {
          emitted = true;
          callback(fallback);
        }
      },
      () => {
        if (!emitted) {
          emitted = true;
          callback(cached !== undefined ? cached : fallback);
        }
      }
    );
  } catch {
    if (!emitted) callback(fallback);
  }

  return unsub;
}

export async function dbWrite(path, value) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  saveLocalCache(clean, value);
  mirrorToServer(clean, value);
  try {
    await withTimeout(set(ref(db, clean), value), 5000);
    return { ok: true, syncedRemote: true };
  } catch (err) {
    return { ok: true, syncedRemote: false, warning: err?.message || "Saved locally & synced to server" };
  }
}

export async function dbMerge(path, partial) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  const existing = (await dbRead(clean, {})) || {};
  const merged = { ...existing, ...partial };
  saveLocalCache(clean, merged);
  mirrorToServer(clean, merged);
  try {
    await withTimeout(update(ref(db, clean), partial), 5000);
    return { ok: true, syncedRemote: true, data: merged };
  } catch (err) {
    return { ok: true, syncedRemote: false, data: merged, warning: err?.message };
  }
}

export async function dbDelete(path) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  removeLocalCache(clean);
  mirrorToServer(clean, null);
  try {
    await withTimeout(remove(ref(db, clean)), 4500);
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export async function dbPushItem(collectionPath, item) {
  const clean = collectionPath.replace(/^\/+|\/+$/g, "");
  const genId = "item_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
  try {
    const newRef = push(ref(db, clean));
    const id = newRef.key || genId;
    const payload = { id, ...item };
    saveLocalChild(clean, id, payload);
    await withTimeout(set(newRef, payload), 4500);
    return { ok: true, id, item: payload };
  } catch {
    const payload = { id: genId, ...item };
    saveLocalChild(clean, genId, payload);
    return { ok: true, id: genId, item: payload };
  }
}

async function ensureUserProfileInRtdb(user, providerName) {
  if (!user || !user.uid) return;
  const existing = await dbRead(`users/${user.uid}`, null);
  const now = new Date().toISOString();
  const isOwner = String(user.email || "").toLowerCase() === "muaaziqbal.vip@gmail.com";
  const profile = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || (user.email ? user.email.split("@")[0] : "BarakatWave Viewer"),
    photoURL: user.photoURL || "",
    provider: existing?.provider || providerName,
    plan: existing?.plan || (isOwner ? "pro" : "free"),
    role: existing?.role || (isOwner ? "admin" : "user"),
    xtreamUsername: existing?.xtreamUsername || "",
    playlistId: existing?.playlistId || "",
    favorites: existing?.favorites || [],
    createdAt: existing?.createdAt || now,
    lastLoginAt: now
  };
  await dbMerge(`users/${user.uid}`, profile);
  if (isOwner) {
    await dbWrite(`admins/${user.uid}`, true);
  }
  return profile;
}

function mirrorToServer(path, value) {
  fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, value })
  }).catch(() => {});
}

function saveLocalCache(path, val) {
  try {
    localStorage.setItem(LOCAL_STORE_PREFIX + path, JSON.stringify(val));
  } catch {
    // ignore storage quota
  }
}

function saveLocalChild(collectionPath, id, val) {
  const existing = loadLocalCache(collectionPath) || {};
  existing[id] = val;
  saveLocalCache(collectionPath, existing);
  mirrorToServer(collectionPath, existing);
}

function loadLocalCache(path) {
  try {
    const raw = localStorage.getItem(LOCAL_STORE_PREFIX + path);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function removeLocalCache(path) {
  try {
    localStorage.removeItem(LOCAL_STORE_PREFIX + path);
  } catch {
    // ignore
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("RTDB timeout")), ms))
  ]);
}
