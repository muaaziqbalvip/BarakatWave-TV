# 🌊 BarakatWave TV — IPTV Reseller Panel Guide (Roman Urdu + English)

> **Mizanora Projects** by **Muaaz Iqbal** — Support: **0306-2015326** (WhatsApp / Call)
> Version **3.0.0** · Live pricing at `/pricing` · Panel at `/reseller` · Admin at `/admin.html`

---

## 1. Naye pages (kya kahan hai)

| Page | Link | Kya hai |
| --- | --- | --- |
| **Pricing** | `/pricing` | Sab packages, JazzCash guide, feature matrix, FAQs |
| **Reseller Panel** | `/reseller` | Order, free trial, dealer login, dashboard, admin control |
| **Legal Center** | `/legal` | Policies ka index |
| **Terms** | `/legal/terms` | Terms of Service |
| **Privacy** | `/legal/privacy` | Privacy Policy |
| **License** | `/legal/license` | Software + API license, signed-link rules |
| **Refunds** | `/legal/refund` | Refund & cancellation policy |
| **Reseller Agreement** | `/legal/reseller-agreement` | Dealer contract (min retail Rs 200) |
| **DMCA** | `/legal/dmca` | Copyright takedown |
| **About Founder** | `/about-founder` | Muaaz Iqbal profile + photos (Google/SEO ke liye) |
| **MAG Portal** | `/portal.php` + `/server/load.php` | MAC address wale MAG / Stalker boxes |

---

## 2. Pricing (jo aap ne approve kiya)

| Plan | Direct client | Reseller (dealer) |
| --- | --- | --- |
| **1-Day PRO Trial** | **FREE** | **FREE** |
| 1 Month | **Rs 200** | **Rs 100** |
| 3 Months | Rs 550 | Rs 275 |
| 6 Months | Rs 1050 | Rs 525 |
| 12 Months | Rs 2000 | Rs 1000 |

**Dealer slabs (per user / month):** 5+ = Rs 100 · 25+ = Rs 95 · 50+ = Rs 90 · 100+ = Rs 85
**Rule:** dealer ka minimum retail **Rs 200** hai — under-cutting pe account suspend.

---

## 3. Payment — JazzCash (manual + review)

1. Customer amount bhejta hai **JazzCash `0306-2015326`** (Account Title: **Muaaz Iqbal**).
2. JazzCash confirmation ka **screenshot** (TID ke saath) le.
3. Screenshot **WhatsApp `0306-2015326`** pe bheje + apna username / dealer code likhe.
4. Aap `/reseller` → **Admin Control** → *Pending orders* me order dekh kar **Approve** karein →
   PRO auto-activate ho jata hai (ya dealer ko credits add ho jate hain).
5. Customer ko M3U + Xtream credentials WhatsApp kar dein (panel se 1-click copy).

> Screenshot upload option order form me bhi hai (optional) — approve karte waqt 🧾 proof link se dekh sakte hain.

---

## 4. Free trial (1 day) ka logic

- Trial tab me email + device → **Activate Free Trial**.
- System auto Xtream username/password + M3U + EPG bana deta hai, expiry **24 ghante**.
- **Abuse guard:** ek email / ek device (browser + IP fingerprint) pe sirf **ek** trial. Dobara try karne pe
  message: *"Trial already used — upgrade Rs 200/month"*.
- Trial user PRO channel list + IMDb VOD sab kuch dekh sakta hai (bas 1 connection).

---

## 5. Dealer (reseller) kaise banayein

1. `/reseller` → **Buy / Order** → *Reseller / dealer* select karein → 5+ credits order karein (Rs 500).
2. JazzCash screenshot WhatsApp karein.
3. Aap approve karein → dealer ko milta hai:
   - **Dealer code:** `RS-XXXXXX`
   - **API key:** `bwr_...`
   - **License key:** `RS-XXXX-XXXX-XXXX` (sirf ek dafa dikhta hai)
   - **Credits:** jitne khareede
4. Dealer `/reseller` → **Dealer Login** me code + API key daal kar login karta hai.

**Dealer dashboard me:** credit balance, naya client (1 credit = 30 din), auto password, MAC field (MAG box),
M3U + EPG link copy, renew, suspend, days-left counter, retail value.

---

## 6. Admin login — ab 3 tareeqe (bug fix)

`/admin.html` pe teen options hain:

1. **Owner PIN** (sab se pakka, kabhi fail nahi hota) — bootstrap PIN: **`03062015326`**
   - Server-side verify hota hai (HMAC session, 12 ghante) — Firebase domain error se koi taluq nahi.
   - PIN change karein: `/reseller` → **Admin Control** → **Security** card, ya Vercel env
     `BARAKATWAVE_ADMIN_PIN` set karein.
2. **Google / Gmail + Password** — Firebase Console me domain add hona zaroori hai:
   Authentication → Settings → **Authorized domains** → `barakatwave.vercel.app` (+ preview domain).
3. **Preview Owner Mode** — temporary preview URL (`*.vercel.app` preview, sandbox, localhost) pe khud
   nazar aata hai, taake testing rukay na.

**Bug fixes jo ho gaye:** PIN se login, "Forgot password" reset link, preview host pe Google popup fail hone
par saaf message + PIN fallback, PIN session ke baad auto-logout nahi hota, sign-out se session clear.

---

## 7. Required Vercel env vars

```bash
# Panel ke data Firebase me save hone ke liye (orders / dealers / clients)
FIREBASE_DATABASE_SECRET=...

# Signed links + PIN session HMAC secret (openssl rand -hex 32)
BARAKATWAVE_SIGNING_SECRET=...

# Owner PIN (default 03062015326, ise badal dein)
BARAKATWAVE_ADMIN_PIN=...

# Signed playback link ki umar (seconds, default 900)
BW_LINK_TTL_SEC=900

# Optional: scripts/CI ke liye admin token
BARAKATWAVE_ADMIN_TOKEN=
```

> `FIREBASE_DATABASE_SECRET` ke bagair panel local mirror pe chalta hai, lekin har serverless
> invocation ke baad data persist nahi hota. Production me ye set karna zaroori hai.

---

## 8. Security (backend link — pakka bandobast)

- **Signed links:** har playback URL `/s/<opaque-token>` hoti hai, `HMAC-SHA256` + expiry (default 15 min).
  Leak ho jaye to kuch minute me dead. Credentials URL me kabhi nazar nahi aate.
- **Tamper detection:** constant-time signature check — ek character badla to reject.
- **Connection caps:** per-account fingerprint (user-agent + masked IP) se fan-out abuse block.
- **SSRF guard:** admin probe private IP / cloud metadata (169.254.169.254) refuse karta hai.
- **Rate limits:** order, trial, PIN, portal — sab pe token bucket.
- **License keys:** sirf SHA-256 hash store hota hai (plaintext nahi).
- **Firebase rules:** `/panel` node browser ke liye completely band (server-only).

---

## 9. Protocols jo support hain

| Protocol | Endpoint | Players |
| --- | --- | --- |
| **Xtream Codes** | `/player_api.php` | Siravex, Smarters, TiviMate, XCIPTV, OTT Navigator |
| **M3U Plus** | `/get.php?username=..&password=..&type=m3u_plus` | sab |
| **EPG / XMLTV** | `/xmltv.php?username=..&password=..` | sab |
| **MAG / MAC portal** | `/portal.php`, `/server/load.php` | Infomir MAG, Stalker, Enigma2 |
| **HLS / DASH** | `/live/...`, `/media/...` | browser + VLC |
| **Recommended player** | [siravex.vercel.app](https://siravex.vercel.app) | browser, no install |

**Demo MAC (testing):** `00:1A:79:00:00:01` — baqi MAC pe box ko WhatsApp number dikhata hai.

---

## 10. SEO / Google (Muaaz Iqbal + IPTV keywords)

- `/sitemap.xml` me ab pricing, reseller, sab legal pages + **founder photos ki image entries**.
- `/legal/founder` pe **ProfilePage + Person schema** (photos, Kasur address, GitHub, Mizanora links).
- 50 blogs (`/blog`) — reseller panel, 1-day trial, MAC IPTV, link security, Siravex, Kashmir/Pakistan-India
  channels, founder profile waghera.
- 7 naye blogs sirf IPTV panel / reseller / security / MAC par.
- `/llms.txt` aur `/llms-full.txt` me pricing, payment, plans, keyword clusters (AI search ke liye).
- Homepage pe pricing band + founder band (images with proper `alt` text — Google Images ke liye).
- `/api/seo/indexnow` se Bing/Copilot/DuckDuckGo/Yandex ko 60+ URLs submit ho sakti hain.

---

## 11. Local testing

```bash
npm run dev      # http://0.0.0.0:3000
npm test         # 138 automated checks (panel, orders, trials, HMAC, MAG, SEO)
```

Aakhri run: **✅ ALL 138 CHECKS PASSED PERFECTLY!**
