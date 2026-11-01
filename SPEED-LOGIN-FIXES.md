# Speed + Login Fixes — kya theek hua (Nov 2026)

BarakatWave TV · Mizanora Projects · Muaaz Iqbal
Repo: `muaaziqbalvip/BarakatWave-TV` · Merged via PR **#15**, **#16**, **#17**

---

## 1. Page hang / slow clicks

| Pehle | Ab |
| --- | --- |
| Har page load par 1,570+ titles ka IMDb bundle (605 KB / 156 KB gzip) download + parse hota tha | Sirf **48 movies + 36 series** ka core seed turant paint hota hai; pura catalog browser ke **idle** time par load hota hai |
| HLS engine (620 KB) har page par preload + service-worker precache | Sirf **pehli playback** par load hota hai (index + admin preview) |
| `dbRead` 4.5 s tak wait kar sakta tha | **Cache-first** jawab (0 ms), network refresh background me, hard ceiling 2.5–3.5 s |
| Admin login ke baad data aane tak khaali screen | Studio **turant paint** hota hai, data baad me stream hota hai |
| 3D card tilt har `pointermove` par layout read + 4 style writes | **Per animation frame** (rAF) throttle + passive listeners |
| Long grids scroll par jank | `content-visibility: auto`, per-card paint containment, `touch-action: manipulation` |

## 2. Google login

- **Redirect mode button** — popup block hone par bhi sign-in complete: site login modal + `/admin.html` dono me.
- **In-app browser detect** (WhatsApp / Instagram / Facebook / TikTok) — saaf message: "Open in Chrome/Safari ya Redirect use karein".
- **Popup watchdog** 75 s — kabhi infinite wait nahi.
- `auth/unauthorized-domain` par exact fix + admin gate me **copy-host helper** (jo hostname Firebase me add karna hai, ek tap me copy).
- Owner PIN aur Email+Password is domain setting se **affected nahi** hote — dono hamesha kaam karte hain.

## 3. Password / email login

- `khashi` jaisa username email ki jagah likhne par: *"…is a username, not an email. Use the full address, e.g. khashi@gmail.com"*.
- Har Firebase error ka human message (network, too-many-requests, user-disabled, invalid API key, popup blocked…).
- Instant "Signing in…" feedback, profile write background me (click block nahi hota), reset-link flow apna label wapas leta hai.
- Reseller `/api/panel` calls par **20 s abort timeout** — login kabhi hang nahi ho sakta.

## 4. Admin auth mismatch (root cause of 403s)

`/api/analytics`, `/api/sync`, `/api/github/push` sirf Firebase ID token lete the, jab ke `/api/panel` Owner PIN session (`bwp_…`) bhi leta tha.
Ab `api/_lib/admin-auth.js` → `authenticateAdmin()` use karta hai, is liye **PIN login se sab admin APIs** kaam karte hain.

Verified locally:

```
POST /api/panel  {"action":"admin/pin-login","pin":"…"}   -> ok, token bwp_…
GET  /api/analytics  (Bearer)                             -> 200 ok:true
GET  /api/analytics  (no token)                           -> 403
admin/reseller-create -> reseller/login -> reseller/client-create -> trial(1 day) -> sab ok:true
```

## 5. Verification

- `npm test` → **ALL 198 CHECKS PASSED** (+9 naye regression checks)
- `/`, `/admin.html`, `/reseller`, `/pricing`, `/legal`, saare JS assets → 200
- `/api/gate`, `/api/stream`, `/api/playlist`, `/api/seo/indexnow`, `/api/probe`, `/api/sync`, `/api/imdb` → expected responses, koi 500 nahi
- Vercel preview builds: pass · PRs CLEAN + MERGEABLE

## 6. Ek kaam jo sirf owner kar sakta hai

Google popup ke liye domain whitelist Firebase Console se hoti hai (code se nahi):

**Firebase Console → Authentication → Settings → Authorized domains** me add karein:

```
barakatwave.vercel.app
```

(Aur agar Vercel preview domain use karte hain to wo bhi.) Is ke baad Google popup + redirect dono chalenge.
