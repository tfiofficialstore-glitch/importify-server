# Importify History Server

Ye ek chhota server hai jo aapke **Bulk Shein Importify** extension se import hone wale
har product ki history save karta hai — jaisa aapne dikhaya tha (Import List dashboard).

Extension jab bhi koi product Shopify mein import karta hai (single ya bulk), ye server
ko us product ki info bhej deta hai, aur ye server usay database mein save kar leta hai.
Phir aap dashboard (browser mein) khol ke poori history dekh sakte hain.

> ℹ️ Data ek simple `data.json` file mein save hota hai — koi extra database
> install karne ki zaroorat nahi, isliye ye **kisi bhi hosting** (Railway,
> Render, ya aapki Namecheap Stellar/cPanel hosting) pe bina kisi masle ke chal jata hai.

---

## 1. Local pe test karna (apne computer pe)

```bash
npm install
cp .env.example .env
```

`.env` file kholein aur `API_KEY` ko koi bhi random secret se replace karein, jaise:

```
API_KEY=sk_9f8a2b7c1d4e6f0a3b5c8d1e2f4a6b8c
```

Phir server chalayein:

```bash
npm start
```

Browser mein kholein: **http://localhost:3000** — yehi aapka dashboard hai.
Login screen pe wahi API_KEY dalein jo `.env` mein set kiya tha.

---

## 2. Internet pe deploy karna (taake extension kahin se bhi connect ho sake)

Extension aapke computer se alag chalta hai (browser mein), isliye server ko
internet pe host karna zaroori hai. Sabse aasan free options:

### Option A — Railway (recommended, sabse aasan)
1. https://railway.app pe account banayein (GitHub se login ho sakta hai)
2. "New Project" → "Deploy from GitHub repo" (pehle is folder ko GitHub pe push karein)
   — ya "Empty Project" bana ke uska CLI use karein
3. Railway khud `npm install` aur `npm start` chala dega
4. Project Settings → Variables mein jaake `API_KEY` add karein (wahi jo aap use karna chahte hain)
5. Railway aapko ek public URL dega, jaisa: `https://importify-history-production.up.railway.app`

### Option B — Render
1. https://render.com pe account banayein
2. "New Web Service" → apna GitHub repo connect karein (ya "Public Git repository" mein
   is code ka link dein)
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment → `API_KEY` variable add karein
6. Deploy hone ke baad ek public URL milega

Dono jagah data `data.json` file mein automatically ban jayega — koi alag
database service lagane ki zaroorat nahi.

> ⚠️ Note: free hosting plans par kabhi kabhi disk/storage reset ho sakta hai agar
> server "sleep" mode mein jaye. Agar aapko permanent history chahiye, Railway ka
> "Volume" feature attach kar lein ya paid plan use karein.

### Option C — Aapki apni Namecheap Stellar/cPanel Hosting

Agar aapke pass already Namecheap Shared Hosting (Stellar/Stellar Plus/Stellar
Business) hai, us pe bhi ye chal sakta hai — isme "Setup Node.js App" feature hota hai:

1. cPanel mein login karein → **SOFTWARE** section mein **"Setup Node.js App"** dhundein aur kholein
2. **"+ CREATE APPLICATION"** dabayen
3. Settings:
   - **Node.js version**: sabse latest available (18 ya usse upar) choose karein
   - **Application mode**: Production
   - **Application root**: koi folder name likh dein, jaise `importify-server` (ye `public_html` NAHI hona chahiye)
   - **Application URL**: apna domain ya subdomain select karein (jaise `history.aapkadomain.com`)
   - **Application startup file**: `server.js`
4. "Create" dabayen — cPanel ek folder bana dega
5. cPanel ke **File Manager** mein us folder (jo Application root mein diya tha) ke andar jayen,
   aur is poori `importify-server` folder ki saari files upload kar dein (ZIP bana ke upload
   karke "Extract" bhi kar sakte hain)
6. Wapas "Setup Node.js App" page pe us application ko kholein → **"Run NPM Install"** button dabayen
   (ye dependencies install karega — chunke koi native/compiled package nahi hai, ye hamesha kaamyab hoga)
7. **Environment Variables** section mein `API_KEY` add karein (koi bhi random secret)
8. **"Restart"** dabayen
9. Apna domain/subdomain browser mein kholein — dashboard khul jana chahiye

---

## 3. Extension ko server se connect karna

1. Extension icon → ⚙️ **Settings** page kholein
2. Neeche **"Import History Server"** section mein:
   - **History Server URL**: apna deploy kiya hua URL paste karein (jaise `https://importify-history-production.up.railway.app`)
   - **History API Key**: wahi API_KEY jo `.env` / Railway Variables mein set kiya tha
3. **Save Settings** dabayein

Bas! Ab jab bhi aap koi product import karenge (single ya bulk), wo automatically
is server pe save ho jayega aur dashboard mein dikhega.

Agar ye fields khali chhor dein, extension bilkul pehle jaisa hi kaam karega —
history save nahi hogi, koi masla nahi hoga.

---

## 4. Poori Collection Import Karna (Product Finder)

Ab aap SKU paste karne ki bajaye, seedha Shein ki koi bhi collection/category
page se products chun ke import kar sakte hain:

1. Shein pe jaake koi **collection/category/search page** kholein (jaise
   "New Arrivals", "Women Dresses", ya koi search result page) — **product page nahi**
2. Extension icon kholein → **"🔎 Sync This Collection Page"** button dabayen
3. Us page ke saare products dashboard ke **"Product Finder"** page mein
   dikhne lagenge
4. Jo products chahiye unke checkbox select karein → **"Import Selected"** dabayen
5. Bas — extension background mein (har ~1 minute check karke) khud hi un
   products ko Shopify mein import kar dega. Popup khula rakhne ki zaroorat nahi,
   bas browser open rahna chahiye.

Product Finder mein status badges dikhte hain: **Available** (abhi select nahi hua) →
**Queued** (aapne select kar liya) → **Importing…** → **Imported ✓** (ya **Failed**
agar koi masla aaya, dobara select karke retry kar sakte hain).



## API Endpoints (reference)

| Method | Path | Description |
|---|---|---|
| POST | `/api/imports` | Naya import record save karta hai |
| GET | `/api/imports?search=&status=&page=&limit=` | Records list karta hai (search/filter/pagination) |
| GET | `/api/imports/:id` | Ek record ki full detail |
| DELETE | `/api/imports/:id` | Record delete karta hai |
| GET | `/api/imports/export/csv` | Poori history CSV mein export |
| GET | `/api/stats` | Dashboard stats (total, success, failed, today, week) |
| POST | `/api/catalog/bulk` | Extension pushes a scraped collection's products |
| GET | `/api/catalog?status=&search=&page=&limit=` | List catalog products (Product Finder page) |
| POST | `/api/catalog/queue` | Mark selected catalog items as queued for import |
| GET | `/api/catalog/queued` | Extension polls this to find work |
| PATCH | `/api/catalog/:id` | Extension updates status as it processes an item |
| DELETE | `/api/catalog/:id` | Remove a catalog item |

Har protected endpoint ko header mein `x-api-key: YOUR_KEY` chahiye
(ya query string mein `?key=YOUR_KEY`, sirf CSV export ke liye).

---

## Security note

- Apna `API_KEY` kabhi kisi ke sath share na karein — jis ke paas ye key hai wo
  aapki poori import history dekh/delete kar sakta hai.
- `.env` file ko kabhi GitHub pe public push na karein (isse `.gitignore` mein
  already excluded hai agar aap git use kar rahe hain).
