# BarakatWave IPTV — Self-Serve Reseller Business Model

BarakatWave TV · Mizanora Projects · Founder: **Muaaz Iqbal** · Support: **0306-2015326**
Live panel: `https://barakatwave.vercel.app/reseller`

---

## 1. Reseller khud register karta hai (koi permission nahi)

| Step | Kya hota hai |
| --- | --- |
| 1. `/reseller` → **🚀 Free Reseller Signup** | Name, city, email, WhatsApp, password, brand name |
| 2. Form submit | Account **foran** ban jata hai — `RS-XXXXXX` dealer code, `bwr_…` API key, license key |
| 3. Starter credits | **3 free credits** (har credit = 1 client ka 1 mahina) |
| 4. Login | **Email + password** se (ya code + API key se) |
| 5. Panel | Turant dashboard — client add karna shuru |

Owner approval ki zaroorat **nahi**. Registration rate-limited hai (6 attempts / 10 minutes per IP), duplicate email reject hoti hai, password `sha256(salt + password)` ke saath store hota hai (timing-safe compare).

---

## 2. Reseller apni price khud set karta hai (profit usi ka)

Panel → **⚙️ My Selling Price & Recharge Number**:

| Field | Default | Matlab |
| --- | --- | --- |
| Connection fee | Rs 50 | Naye client se ek dafa liya jane wala charge |
| Monthly | Rs 300 | Har mahine ki selling price |
| 3 months | Rs 800 | Quarter deal |
| 12 months | Rs 2800 | Yearly deal |
| Recharge WhatsApp | reseller ka number | **Har live channel par yehi number dikhta hai** |

**Profit math (panel me live):**

```
profit = collected − credits cost
credits cost = credits used × Rs 100 (BarakatWave dealer rate)
monthly margin per client = aapki monthly price − 100
```

Example: 10 clients × Rs 300/month = Rs 3000 collected, cost Rs 1000 → **profit Rs 2000/month**.

Credits JazzCash **0306-2015326** (Muaaz Iqbal) se top-up hote hain — minimum 5 credits (Rs 500).

---

## 3. Client add karna (Xtream + MAC/Stalker — har type)

Dashboard → **➕ Create new client**:

- **Username / password** (ya auto-generate)
- **Client WhatsApp**
- **Devices** (1–5 connections)
- **Plan / first period** (1, 3, 6 ya 12 mahine)
- **Connection fee** (jo aap abhi le rahe hain — ledger me record hota hai)
- **MAC address** — MAG / Stalker boxes ke liye `00:1A:79:XX:XX:XX`

Create hone par milta hai:

```
Xtream:  Host https://barakatwave.vercel.app | Port 443 | username | password
M3U Plus: /get.php?username=USER&password=PASS&type=m3u_plus&output=m3u8
EPG:      /xmltv.php?username=USER&password=PASS
Stalker:  Portal https://barakatwave.vercel.app/c/  + MAC (MAG box)
Player:   Siravex IPTV Player (https://siravex.vercel.app)
```

Har client 1 credit leta hai (1 mahina). 6/12 mahine wale plans me har mahina = 1 credit.

---

## 4. Paisa lena, renew karna, block karna

| Action | Kaise | Natija |
| --- | --- | --- |
| **💰 Payment** | Client row → 💰 | Mahine poochta hai → expiry barhti hai + credits katte hain + ledger me record |
| **🔄 Renew** | Client row → 🔄 | Sirf credit se renew (paisa alag se record karein) |
| **⛔ Block** | Client row → ⛔ | Service foran band (Xtream + M3U + Stalker) |
| **▶ Unblock** | Client row → ▶ | Service wapas chalu |

**Non-payment rule:** client ki `expDate` guzarne par Xtream/Stalker **khud** block kar deta hai:

```
player_api.php → { "auth": 0, "status": "Expired",
                   "message": "Subscription khatam ho gaya. Renew karne ke liye <reseller brand> se rabta karein: <reseller number>" }

get.php (M3U) → #EXTM3U
                #EXTINF:-1,Subscription Expired - Renew: <reseller brand> <reseller number>
```

Yani client ko **uske reseller ka** number dikhta hai — BarakatWave ka nahi.

---

## 5. Har live channel par live recharge

Site ke player ke neeche **📲 Recharge / Renew** strip:

- Client kisi reseller ke through hai → **reseller ka brand + number + price** aur WhatsApp button
  (message pre-filled: “Assalam-o-Alaikum <brand>, mujhe IPTV recharge karna hai (username: …)”)
- Direct client hai → **Barakat IPTV Recharge** strip with official support `0306-2015326`
- Lookup 10 minute cache hota hai → channel badalne par zero extra delay
- Public endpoint: `GET /api/panel?action=recharge/contact&username=…` (ya `&mac=…`)
  — sirf brand, number aur price return karta hai; **apiKey/license/password kabhi nahi**.

---

## 6. Security & tracking

- Reseller auth: `x-api-key` **ya** `bw_` session; license-key mismatch → 401; suspended dealer → 403
- Password login rate-limited (12 / 5 min), registration 6 / 10 min
- Ledger: har payment `panel/payments` me (kitna, kitne mahine, via, kab, kis reseller ne)
- Audit log: `reseller.self-registered`, `reseller.pricing`, `client.created`, `client.payment`
- Owner view: `/reseller` → **Admin Control** (Owner PIN `03062015326`) → dealers, credits, clients, audit
- `admin/payments` action se owner ko saari collections + total milta hai
- Expired/suspended clients ko Xtream, M3U aur Stalker — teeno raaste se block

---

## 7. Quick API reference (reseller)

| Action | Method | Auth | Kaam |
| --- | --- | --- | --- |
| `reseller/register` | POST | public | Auto signup → code + apiKey + 3 credits |
| `reseller/login-password` | POST | public | Email + password login |
| `reseller/login` | POST | api-key | Code + API key login + dashboard data |
| `reseller/pricing-set` | POST | api-key | Apni price + recharge number set |
| `reseller/client-create` | POST | api-key | Xtream ya MAC client + links |
| `reseller/payment-record` | POST | api-key | Paisa mila → renew + profit ledger |
| `reseller/client-block` | POST | api-key | Block / unblock |
| `reseller/ledger` | POST | api-key | Payments + profit summary |
| `reseller/finance` | POST | api-key | Revenue / cost / profit |
| `recharge/contact` | GET | public | Client ka reseller contact |

---

## 8. Verification

`npm test` → **215 checks pass**, including:

- reseller self-registration open + credentials valid + starter credits
- duplicate email rejected, wrong password rejected
- own pricing + recharge number saved
- MAC/Stalker client create + connection fee collected
- payment record → renew + credit consumption + profit math
- public recharge lookup returns brand/number but **never** the API key
- block / unblock client
- expired client blocked by `player_api.php` and by `get.php` M3U
