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
| **📺 Built-in Broadcast Live TV + Cinema Player** | Browser ke andar `hls.js` + automatic multi-server relay failover, quality selector (Auto/1080p/720p), multi-audio track, Picture-in-Picture, aur Theater Mode. |
| **🎬 IMDb-Powered Movies (VOD) & Series Engine** | **IMDb ID (`tt...`)** se 1-Click aur Bulk auto-loader (official IMDb rating, HD poster/backdrop, cast, director, genres, plot & episodes) — Web Cinema Hub, Admin Studio, aur Xtream Codes (`get_vod_*` + `get_series_*`) teeno me live sync! Jab tak VOD library build ho rahi hai, har Movie/Episode **"Service Is Building — Coming Soon"** HD video chalata hai. |
| **📱 100% Televizo-Proof 4-Video Broadcast Suite** | **(1) Welcome Intro Video** (3-Phase Pure-Intro -> `#EXT-X-DISCONTINUITY` -> Live Channel handoff jo **Televizo**, IPTV Smarters, TiviMate, XCIPTV, OTT Navigator aur VLC sab par 100% chalta hai), **(2) Channel Offline Standby Video** (koi bhi channel link down hone par khud-ba-khud chalti hai), **(3) PRO VIP Unlock Video** (`0306-2015326`), aur **(4) Coming Soon Cinema Video** — chaharo Admin Panel se customize ho sakti hain! |
| **🔐 Dual Firebase Authentication & 1 Free Xtream** | **Google Sign-In** AUR **Gmail / Email + Password** Sign Up, Login & Reset (`barakatwave-tv` Firebase 13.1.0 + RTDB) + har user ke liye **1 Permanent Free Xtream Server** (`Host`, `Port 443`, `Username`, `Password`, `get.php` M3U Plus, `xmltv.php` EPG). |
| **⚡ Smart Priority Channel Sorting & Auto-Adjust** | Admin Panel me `#` position change, drag-drop, edit ya delete karne par baqi tamam channels automatically `#1..#N` adjust hote hain + Priority Emoji Xtream Groups (`1. 🇵🇰 PK Top -> 2. 🕌 Islamic -> 3. 🎭 Drama -> 4. 📰 News -> 5. 🎬 Movies`) + GitHub Token `.m3u8` Push! |
| **☀️ 6 Luxury Light & Dark Broadcast Themes** | First-class Light Themes (*☀️ Pearl Daylight* default, *📜 Ivory Studio*, *💎 Sky Breeze*) aur Dark Broadcast Themes (*🌊 Barakat Midnight*, *👑 Mizanora Gold*, *🔮 Noor Amethyst*). |
| **🚀 Viral Google Search Console, AI SEO & Muaaz Iqbal Blogs** | Dynamic `/sitemap.xml`, `/rss.xml`, `/llms.txt`, `/llms-full.txt`, IndexNow auto-ping, aur **16 Server-Side Rendered (SSR) SEO Blogs** (`/blog/<slug>`) — jin me **Muaaz Iqbal** aur **Mizanora Projects** par dedicated biographical aur engineering articles shamil hain! |
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
