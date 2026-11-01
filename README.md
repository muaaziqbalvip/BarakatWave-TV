> **Production warning:** This branch is a work in progress, not a production-ready paid IPTV platform. Manual reseller charges and Xtream expiry controls are available, but payment verification, full reseller provisioning and secure web PRO access are incomplete. Existing stream URLs and credentials may be exposed. See [Deployment safety and current scope](#deployment-safety-and-current-scope) before deploying, publishing Firebase rules or accepting payments. Some older feature descriptions below predate this warning and should not be treated as guarantees.

<div align="center">

<img src="public/assets/img/brand/barakatwave-logo.png" alt="Barakat Wave Streaming Network Logo" width="200px" />

# 🌊 BarakatWave Live TV (`BarakatWave-TV`) 📺

**A Flagship Streaming Platform Under [Mizanora Projects](https://mizanora.vercel.app) — Founded, Designed & Engineered by [Muaaz Iqbal](https://github.com/muaaziqbalvip)**

[![Live Website](https://img.shields.io/badge/Live%20Web%20App-barakatwave.vercel.app-00d4ff?style=for-the-badge&logo=vercel)](https://barakatwave.vercel.app)
[![Parent Ecosystem](https://img.shields.io/badge/Ecosystem-Mizanora%20Projects-d4af37?style=for-the-badge)](https://mizanora.vercel.app)
[![Founder & Architect](https://img.shields.io/badge/Founder%20%26%20Developer-Muaaz%20Iqbal-22c55e?style=for-the-badge)](https://github.com/muaaziqbalvip)
[![PRO VIP Support](https://img.shields.io/badge/PRO%20VIP%20WhatsApp-0306--2015326-25D366?style=for-the-badge&logo=whatsapp)](https://wa.me/923062015326)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

*Next-Generation Live HLS TV Studio, One-Time Free Personal Xtream Codes Server, Custom Cloud M3U8 Playlist Builder, Dynamic Pre-Roll & PRO-Lock Video Stitching, and AI/Google Viral SEO Engine.*

</div>

---

## 🌟 Project Overview (English + Roman Urdu)

**BarakatWave Live TV** (`https://barakatwave.vercel.app`) **Mizanora Projects** ke tehat **Muaaz Iqbal** ka design aur engineer kiya gaya full-stack Live TV aur Cloud IPTV Xtream Network hai:

| Module | Kya Karta Hai |
| --- | --- |
| **📺 Built-in Broadcast Live TV + Cinema Player** | Browser ke andar `hls.js` + automatic multi-server relay failover, quality selector (Auto/1080p/720p), multi-audio track, Picture-in-Picture, aur Theater Mode. |
| **🎬 IMDb-Powered Movies (VOD) & Series Engine** | **IMDb ID (`tt...`)** se 1-Click aur Bulk auto-loader (official IMDb rating, HD poster/backdrop, cast, director, genres, plot & episodes) — Web Cinema Hub, Admin Studio, aur Xtream Codes (`get_vod_*` + `get_series_*`) teeno me live sync! Jab tak VOD library build ho rahi hai, har Movie/Episode **"Service Is Building — Coming Soon"** HD video chalata hai. |
| **📱 100% Televizo-Proof 4-Video Broadcast Suite** | **(1) Welcome Intro Video** (3-Phase Pure-Intro -> `#EXT-X-DISCONTINUITY` -> Live Channel handoff jo **Televizo**, IPTV Smarters, TiviMate, XCIPTV, OTT Navigator aur VLC sab par 100% chalta hai), **(2) Channel Offline Standby Video** (koi bhi channel link down hone par khud-ba-khud chalti hai), **(3) PRO VIP Unlock Video** (`0306-2015326`), aur **(4) Coming Soon Cinema Video** — chaharo Admin Panel se customize ho sakti hain! |
| **🔐 Dual Firebase Authentication & 1 Free Xtream** | **Google Sign-In** AUR **Gmail / Email + Password** Sign Up, Login & Reset (`barakatwave-tv` Firebase 13.1.0 + RTDB) + har user ke liye **1 Permanent Free Xtream Server** (`Host`, `Port 443`, `Username`, `Password`, `get.php` M3U Plus, `xmltv.php` EPG). |
| **⚡ Smart Priority Channel Sorting & Auto-Adjust** | Admin Panel me `#` position change, drag-drop, edit ya delete karne par baqi tamam channels automatically `#1..#N` adjust hote hain + Priority Emoji Xtream Groups (`1. 🇵🇰 PK Top -> 2. 🕌 Islamic -> 3. 🎭 Drama -> 4. 📰 News -> 5. 🎬 Movies`) + GitHub Token `.m3u8` Push! |
| **☀️ 6 Luxury Light & Dark Broadcast Themes** | First-class Light Themes (*☀️ Pearl Daylight* default, *📜 Ivory Studio*, *💎 Sky Breeze*) aur Dark Broadcast Themes (*🌊 Barakat Midnight*, *👑 Mizanora Gold*, *🔮 Noor Amethyst*). |
| **🚀 Viral Google Search Console, AI SEO & Muaaz Iqbal Blogs** | Dynamic `/sitemap.xml`, `/rss.xml`, `/llms.txt`, `/llms-full.txt`, IndexNow auto-ping, aur **16 Server-Side Rendered (SSR) SEO Blogs** (`/blog/<slug>`) — jin me **Muaaz Iqbal** aur **Mizanora Projects** par dedicated biographical aur engineering articles shamil hain! |
| **👑 BarakatWave TV PRO VIP & Support** | PRO VIP channels unlock karwane ke liye official rabta: **0306-2015326** (`+92 306 2015326` WhatsApp/Call) + Reviews & Support Ticket system. |

---

## 💳 IPTV Subscriptions, Reseller Panel & JazzCash Payments (v3.0)

The flagship **IPTV Reseller Panel** lives at **`/reseller`**, with public pricing at **`/pricing`** and all policies at **`/legal`**.

| Offering | Price | Notes |
| --- | --- | --- |
| **Free PRO Trial** | **PKR 0** | 1 day (24h), full PRO channel list + IMDb VOD, one per person/device |
| **Direct client** | **PKR 200** / user / month | 1 device, Xtream + M3U + EPG, WhatsApp support |
| **Reseller / dealer** | **PKR 100** / user / month | Min 5 credits, credits never expire, retail floor PKR 200 |
| Volume slabs | 25+ → 95, 50+ → 90, 100+ → 85 | Per user / month |

**Payment (manual, verified):**
1. Send the amount to **JazzCash `0306-2015326`** (Account Title: *Muaaz Iqbal*).
2. Screenshot the JazzCash confirmation (keep the TID).
3. WhatsApp the screenshot to **0306-2015326** with your username / dealer code.
4. Admin approves the order → PRO or dealer credits are activated (usually < 30 min).

### Panel feature set

- **Public:** plan cards, order creation with auto total (Rs 200 direct / Rs 100 reseller), order tracking by ID, free 1-day trial with auto-generated Xtream credentials, optional payment-screenshot upload.
- **Dealer dashboard:** code + `bwr_…` API key login, credit balance, create client (1 credit = 30 days), auto M3U Plus + XMLTV EPG link generation, password auto-generation, MAC field for MAG boxes, renew / suspend, expiry + days-left tracking, retail value estimate.
- **Admin control:** pending order review with one-click approve/reject auto-provisioning, dealer creation with license key, credit top-ups, all-clients table, revenue & 7-day analytics, audit log, PIN rotation.
- **Security:** HMAC-SHA256 signed `/s/<token>` playback links with short expiry (default 15 min), constant-time verification, per-account connection fingerprint caps, opaque links (no credentials in URLs), SHA-256 hashed license keys, rate limited order/trial/PIN endpoints, server-only `/panel` RTDB node.

### API surface (`/api/panel`)

| Action | Auth | Purpose |
| --- | --- | --- |
| `config` / `plans` | public | Plans, prices, payment guide, feature matrix |
| `order` | public | Create order (Rs 200 / Rs 100 pricing enforced server-side) |
| `order-status` | public | Track an order by ID |
| `trial` | public | Claim the free 1-day PRO trial (abuse-guarded) |
| `resolve` | signed | Resolve `/s/<token>` → signed stream redirect |
| `reseller/login`, `reseller/stats`, `reseller/clients` | dealer key | Dealer dashboard data |
| `reseller/client-create`, `client-renew`, `client-suspend`, `secure-link` | dealer key | Manage clients (credits enforced) |
| `admin/analytics`, `admin/orders`, `admin/order-review` | admin | Revenue, order approval + provisioning |
| `admin/resellers`, `admin/reseller-create`, `admin/credits-topup` | admin | Dealer & credit management |
| `admin/clients`, `admin/client-create/renew/suspend`, `admin/audit` | admin | Full client + audit access |
| `admin/pin-login`, `admin/pin-set` | PIN / admin | Owner PIN session (12h HMAC) & rotation |

### Admin login (three ways — fixes "admin login not working")

1. **Owner PIN** (recommended fallback): `/admin.html` → *Unlock with Owner PIN*. Bootstrap PIN is **`03062015326`**; change it immediately in **`/reseller` → Admin Control → Security** or by setting `BARAKATWAVE_ADMIN_PIN` in Vercel.
2. **Firebase Google / Email+Password** — requires the exact domain in Firebase → Authentication → Settings → **Authorized domains** (`barakatwave.vercel.app`, plus any `*.vercel.app` preview domain you use).
3. **Preview Owner Mode** — automatically shown on temporary preview hosts (e.g. sandbox URLs) where Firebase cannot authorize the domain.

> If Google popup says `auth/unauthorized-domain`, the Owner PIN path always works because it is verified server-side, not by Firebase.

---

## 🧩 Required env vars for the panel

```bash
FIREBASE_DATABASE_SECRET=...        # so serverless functions can write /panel, /xtreamAccounts
BARAKATWAVE_SIGNING_SECRET=...      # HMAC secret for signed links + PIN sessions (openssl rand -hex 32)
BARAKATWAVE_ADMIN_PIN=...           # owner PIN override (bootstrap default: 03062015326)
BW_LINK_TTL_SEC=900                 # signed playback link lifetime
BARAKATWAVE_ADMIN_TOKEN=...         # optional script/CI admin token
```

Without `FIREBASE_DATABASE_SECRET` the panel still functions on the in-process/local mirror, but orders/dealers/clients may not persist across serverless invocations.

---

## 🚀 Deploy on Vercel (`barakatwave.vercel.app`) & Firebase Setup

### 1. Firebase Console (`barakatwave-tv`)
1. **Authentication** &rarr; **Sign-in method** &rarr; **Google** aur **Email/Password** dono **Enable** karein.
2. **Authentication** &rarr; **Settings** &rarr; **Authorized domains** me `barakatwave.vercel.app` add karein.
3. **Realtime Database** &rarr; Create Database &rarr; **Rules** tab me [`firebase/database.rules.json`](firebase/database.rules.json) paste kar ke **Publish** karein.

### 2. Deploy to Vercel
1. Vercel me GitHub repo `muaaziqbalvip/BarakatWave-TV` import karein aur domain `barakatwave.vercel.app` assign karein.
2. Zero build-step friction: Static frontend `public/` se aur Xtream/HLS/SEO endpoints `api/` serverless functions se automatically chalte hain!
3. `/admin.html` khol kar `muaaziqbal.vip@gmail.com` se login karein — aap automatically **Super Admin** ban jayenge!

---

## 📲 Xtream Codes Player Setup (IPTV Smarters, TiviMate, XCIPTV, VLC)

| Field | Value |
| --- | --- |
| **Portal / Any Name** | `BarakatWave TV` |
| **Server URL** | `https://barakatwave.vercel.app` |
| **Port** | `443` (HTTPS) / `80` (HTTP) |
| **Username & Password** | Sign in at `barakatwave.vercel.app/#xtream` to claim your Free Server |
| **M3U Plus URL** | `https://barakatwave.vercel.app/get.php?username=USER&password=PASS&type=m3u_plus&output=m3u8` |
| **EPG XMLTV URL** | `https://barakatwave.vercel.app/xmltv.php?username=USER&password=PASS` |

---

## 🧪 Local Development & Automated Verification

```bash
# Generate per-channel M3U8 files in data/streams/
npm run generate:m3u

# Run full 25+ automated Xtream, HLS Stitching & SEO self-tests
npm test

# Start local live server on 0.0.0.0:3000
npm run dev
```

---

## 👤 Credits & Ownership

- **Founder, Lead Developer & Innovator:** **Muaaz Iqbal** (Kasur, Punjab, Pakistan)
- **Ecosystem:** **Mizanora Projects** ([mizanora.vercel.app](https://mizanora.vercel.app))
- **PRO VIP Membership & Support:** `0306-2015326` ([WhatsApp Direct](https://wa.me/923062015326))

## Deployment safety and current scope

The PRO page describes **manual** WhatsApp/JazzCash requests. Payment verification, automated billing and self-service reseller provisioning are **not implemented**. A basic manually maintained reseller ledger is available. The admin Xtream table supports manual one-day trial issuance and 30-day paid extensions; Xtream playback checks expiry and falls back to free access. Trials are tracked per account, not per person, and concurrent issuance is not transactionally protected. Do not accept payments or offer paid streams until these are built and independently reviewed. Confirm content distribution rights and obtain legal review of `public/policies.html` before using it as a final policy.

Security work in this branch rejects anonymous mirror writes, GitHub publishing and analytics dashboard access, disables the raw channel export, and ignores the untrusted web `plan` parameter. Until verified web entitlements are implemented, **web PRO playback remains locked even for paid users**. Admin API operations require a verified Firebase ID token, Firebase Identity Toolkit access and the admin database rules. The analytics ingestion endpoint remains public and is not authoritative billing data.

Important unresolved risks: public channel records can contain upstream URLs; several other playback paths can expose stream URLs; Xtream passwords are stored in plaintext; the stream signing secret has a known fallback; rate limiting is per instance; and other routes and Firebase rules need a full security audit. Treat existing credentials and stream URLs as exposed and rotate them. No streaming system can prevent a viewer from capturing content. Test and publish `firebase/database.rules.json` to the actual Firebase database: the revised rules require verified owner email, restrict Xtream records to their owner/admin, and remove open first-admin bootstrap. **Set `FIREBASE_DATABASE_SECRET` securely on the server before publishing those rules**, or server-side Xtream authentication will fail. Provision and test verified administrator access and backups first. The local mirror is not a durable production database.

The supplied photos are stored in `public/assets/muaaz/` and the supplied logo in `public/assets/brand/`. Search ranking and image indexing cannot be guaranteed; only publish images with the subject's permission.

### Manual Xtream membership operations

After verifying payment outside the app, an administrator can open **Xtream & PRO Users** and choose **1-day trial**, **Add 30 days**, or **Set free** for an existing account. The first two actions store an expiry in seconds; renewals extend an unexpired subscription. A trial cannot be applied twice to the same account record. Admin membership changes require a successful Firebase write and the updated database rules. Legacy PRO records with no expiry remain active until the operator sets a duration or downgrades them. This is not automatic payment review, per-person trial enforcement, or an enforced simultaneous-connection limit.

### Manual reseller ledger

A reseller signs in, opens **Resellers** (or the PRO page's Open ledger button) and shares the displayed Firebase UID with an admin. In **Admin → Reseller Ledger**, load that UID, save the reseller name, and record Rs 100 charges for existing Xtream usernames and billing-period labels. An admin can mark each charge paid only after manual review; the reseller can read only their own ledger. Charges do not create, renew, or activate accounts, and the period is a label rather than an automated billing cycle. This ledger is not a payment processor, invoice system, or self-service reseller management panel. Duplicate checks are not transactional: avoid concurrent edits and reconcile records manually. Publish and test the updated Firebase rules before use; no Firebase emulator integration tests are included.

### Playlist migration and security

Cloud playlist output no longer includes Xtream credentials and new playlist IDs are randomly generated. Publishing the updated Firebase rules also restricts direct database reads to the owner/admin (the server needs `FIREBASE_DATABASE_SECRET` to serve shared playlist links). Legacy records may still contain plaintext passwords; remove those fields from existing records and rotate exposed Xtream passwords. Existing playlist URLs remain bearer links, may be guessable, and can reveal custom stream URLs. Replace old links where privacy matters. Cloud playlist links now use free channel routes; use authenticated Xtream player credentials separately for PRO.
