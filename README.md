<div align="center">

<img src="https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png" alt="Barakat Wave Streaming Network Logo" width="220px" />

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
| **📺 Built-in Broadcast Live TV Player** | Browser ke andar `hls.js` + automatic multi-server relay failover, quality selector (Auto/1080p/720p), multi-audio track, Picture-in-Picture, aur Theater Mode. |
| **🔐 Dual Firebase Authentication** | **Google Sign-In** AUR **Gmail / Email + Password** Sign Up, Login & Password Reset (`barakatwave-tv` Firebase 13.1.0 + Realtime Database). |
| **⚡ 1-Time Free Personal Xtream Server** | Login ke baad har user apna **1 Permanent Free Xtream Codes Server** (`Host`, `Port 443`, `Username`, `Password`, `get.php` M3U Plus, `xmltv.php` EPG) generate kar sakta hai jo dashboard me hamesha save rehta hai. |
| **📋 Personal M3U8 Playlist Studio** | User catalog se pasandida channels select kar ke ya apne `.m3u8` links add kar ke apni cloud playlist (`/playlist/<id>.m3u8`) bana aur download kar sakta hai. |
| **🎬 Live M3U8 Welcome & PRO Unlock Video** | Har channel chalne se pehle Admin ki set ki hui **Default Welcome Animation Video** chalti hai (`#EXT-X-DISCONTINUITY` HLS stitching). Agar channel **`PRO VIP`** ho to Free users ko live `.m3u8` ke andar **Premium Unlock Broadcast Video** (`0306-2015326`) lagatar dikhayi deti hai! |
| **🐙 Admin Panel + GitHub Token Push** | Channels add karte waqt working `.m3u8` probe/preview, Bulk `#EXTM3U` import/export, `FREE` / `PRO` toggle, aur **GitHub Token** se har channel ki alag `.m3u8` file (`data/streams/<slug>.m3u8`) repo me auto-push! |
| **🎨 5 Signature Broadcast Themes** | *Barakat Wave Midnight*, *Mizanora Royal Gold*, *Emerald Noor*, *Royal Cinema*, aur *Daylight Pearl*. |
| **🚀 Viral Google Search Console & AI SEO** | Dynamic `/sitemap.xml`, `/rss.xml`, `/llms.txt`, `/llms-full.txt`, IndexNow auto-ping, aur 12+ Server-Side Rendered (SSR) SEO Blogs (`/blog/<slug>`) taake Google aur har AI assistant ke paas **Muaaz Iqbal**, **Mizanora Projects**, aur **BarakatWave TV** ki mukammal maloomat ho! |
| **👑 BarakatWave TV PRO VIP & Support** | PRO VIP channels unlock karwane ke liye official rabta: **0306-2015326** (`+92 306 2015326` WhatsApp/Call) + Reviews & Support Ticket system. |

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
