# 🚀 Connecting the Firebase Frontend to the Render Backend

The frontend is live at **https://flinkserve.web.app/** (Firebase Hosting).
The backend must be deployed to **Render.com** so the hosted frontend can reach it.

```
┌──────────────────────────┐        HTTPS + JWT         ┌────────────────────────────┐
│  Firebase Hosting        │  ────────────────────────▶ │  Render.com (Node)         │
│  flinkserve.web.app      │   /api/*  /uploads/*       │  flinkserve-backend        │
│  (React + Vite build)    │ ◀────────────────────────  │  .onrender.com             │
└──────────────────────────┘        JSON + CORS        └─────────────┬──────────────┘
                                                                    │
                                                                    ▼
                                                        ┌──────────────────────┐
                                                        │  MongoDB Atlas       │
                                                        │  (already cloud-hosted) │
                                                        └──────────────────────┘
```

---

## Step 1 — Push the code to GitHub

The backend files (`Backend/`, `render.yaml`) must be on GitHub so Render can read them.

```bash
git add .
git commit -m "Prepare backend for Render deployment"
git push origin main
```

## Step 2 — Deploy the backend on Render

**Option A — Blueprint (recommended):**
1. Go to https://dashboard.render.com → **New** → **Blueprint**
2. Select this repository — Render reads `render.yaml` and pre-fills everything
3. When prompted, paste your **MongoDB Atlas connection string** for `MONGODB_URI`
4. Click **Apply** — Render builds and starts the service

**Option B — Manual:**
1. https://dashboard.render.com → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Root Directory:** `Backend`
   - **Runtime:** Node
   - **Build Command:** `npm ci || npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
4. Under **Environment**, add the variables from `Backend/.env.example`:
   - `NODE_ENV=production`
   - `MONGODB_URI=mongodb+srv://...` (your Atlas string)
   - `JWT_SECRET=<long random string>` (generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
   - `JWT_EXPIRES_IN=30d`
   - `CORS_ORIGIN=https://flinkserve.web.app,https://flinkserve.firebaseapp.com`
5. Click **Create Web Service**

## Step 3 — Verify the backend is live

Your service URL looks like `https://flinkserve-backend-xxxx.onrender.com`.

```bash
curl https://YOUR-BACKEND-URL.onrender.com/health
# → {"status":"OK","timestamp":"...","environment":"production"}
```

> ⚠️ **Free-tier cold starts:** Render free services sleep after ~15 min of
> inactivity. The first request after sleeping takes ~30–60s to respond.
> Keep the tab open or use a pinger (e.g. UptimeRobot) to stay warm.

## Step 4 — Point the frontend at the backend

1. Open `frontend/.env.production` and set your real Render URL:

   ```
   VITE_API_BASE_URL=https://flinkserve-backend-xxxx.onrender.com
   ```

   (Leave `frontend/.env` absent or `VITE_API_BASE_URL=` empty for local dev —
   the Vite proxy then routes `/api` to `localhost:5001`.)

2. Rebuild and redeploy to Firebase:

   ```bash
   cd frontend
   npm run build
   firebase deploy --only hosting
   ```

## Step 5 — Verify the full stack

Open https://flinkserve.web.app and test each section:

| Section | What to test | Backend route |
|---|---|---|
| Home / Browse | Service cards load from the database | `GET /api/services` |
| Search + Filters | Category, price, rating filters return results | `GET /api/services?...` |
| Service details | Gallery, reviews, provider info | `GET /api/services/:id`, `GET /api/reviews/service/:id` |
| Register | Create a seeker & a provider account | `POST /api/auth/register` |
| Login | Log in with the created accounts | `POST /api/auth/login` |
| Post a Service (provider) | Create a service with images | `POST /api/services`, `POST /api/upload/service-images` |
| Bookings (seeker) | Book a service, see it in dashboard | `POST /api/bookings`, `GET /api/bookings` |
| Bookings (provider) | Confirm / complete bookings | `PATCH /api/bookings/:id/status` |
| Profile settings | Update profile, change password | `PUT /api/auth/profile`, `PUT /api/auth/change-password` |

If a request fails, open DevTools → **Network** tab and check:
- The request URL points to your Render domain (not localhost)
- Response headers contain `access-control-allow-origin: https://flinkserve.web.app`
- The backend logs in the Render dashboard show the incoming request

## 🛑 Troubleshooting

### `GET /health` shows `"database":{"state":"disconnected"}` and APIs return 503

Everything on the frontend looks broken (services, bookings, login) but the
server itself is up. `/health` reports something like:

```json
"lastError": "...tlsv1 alert internal error...SSL alert number 80"
```

**Cause:** MongoDB Atlas is refusing the TLS handshake because Render's IP
address is not on the cluster's allowlist. Render's free tier uses **dynamic
outbound IPs**, so allow-listing a single address will never stay valid.

**Fix:**

1. Open https://cloud.mongodb.com → your project → **Security** → **Network Access**
2. Click **Add IP Address**
3. Choose **Allow Access from Anywhere** and enter `0.0.0.0/0`
4. Save, wait ~1 minute, then re-check:

```bash
curl -s https://flinkserve-backend.onrender.com/health
# want: "state":"connected","ping":"ok"
```

> **Why `0.0.0.0/0` is acceptable here:** Render free instances have no static
> egress IP, so this is the only workable option without a paid plan. Your
> database is still protected by the username/password in `MONGODB_URI` and by
> Atlas TLS. If you later move to a paid Render plan, replace `0.0.0.0/0` with
> that plan's static outbound IPs (Render → your service → **Connect** →
> **Outbound IPs**).

---

### `Access to fetch ... blocked by CORS policy: No 'Access-Control-Allow-Origin' header`

Check the HTTP status of the failing request first — a **502/503** backend will
produce this exact browser message even though CORS is configured correctly.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://flinkserve-backend.onrender.com/health
```

- **502** → no live deploy. Render dashboard → your service → **Events** /
  **Logs**, and confirm the latest commit deployed.
- **503** → server is up but MongoDB is down (see the Atlas section above).
- **204 but still blocked** → the origin is not in the allowlist. Add it to the
  `CORS_ORIGIN` environment variable on Render (comma-separated), or to
  `PROD_ORIGINS` in `Backend/server.js`.

The backend always emits the CORS headers, and answers `OPTIONS` preflight
requests **before** the rate limiter and router, so a preflight can no longer be
blocked by an unrelated failure. Verify with:

```bash
curl -s -D - -o /dev/null -X OPTIONS \
  https://flinkserve-backend.onrender.com/api/auth/register \
  -H 'Origin: https://flinkserve.web.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  | grep -i access-control
```

---

### Google / Facebook buttons do nothing

Both buttons are wired to `POST /api/auth/social` but need provider credentials.
Until they are configured the buttons stay visible but disabled with a
"Not configured yet" tooltip.

**Google**
1. https://console.cloud.google.com → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID** → **Web application**
3. **Authorised JavaScript origins:** `https://flinkserve.web.app`
   (plus `http://localhost:5173` for local testing)
4. Copy the client ID into the frontend build env as `VITE_GOOGLE_CLIENT_ID`
5. Optionally set `GOOGLE_CLIENT_ID` on Render to the same value so the backend
   rejects tokens minted for other applications

**Facebook**
1. https://developers.facebook.com → **My Apps** → your app → **Settings** → **Basic**
2. Copy the **App ID** → frontend `VITE_FACEBOOK_APP_ID`
3. Copy the **App Secret** → Render env var `FACEBOOK_APP_SECRET` (never in the frontend)
4. Set `FACEBOOK_APP_ID` on Render too, and add `https://flinkserve.web.app`
   under **App Domains** and **Facebook Login → Settings → Valid OAuth Redirect URIs**

Then rebuild and redeploy the frontend:

```bash
cd frontend
npm run build
npx firebase deploy --only hosting
```

---

### The database name is `test`

`MONGODB_URI` does not contain a database name, so MongoDB defaults to `test`.
That is why `/health` reports `"name":"test"` — it works, but it is implicit.

To use a named database, append `/flinkserve` before the `?`:

```
mongodb+srv://user:pass@cluster0.pcuxyix.mongodb.net/flinkserve?appName=Cluster0
```

⚠️ **Only do this after copying your data across**, otherwise the app will point
at an empty database and every listing will look blank. Copy each collection
from `test` into `flinkserve` first (MongoDB Compass, `mongodump`/`mongorestore`,
or the `$merge` aggregation stage).

---

## Notes & limitations

- **Uploads are ephemeral on Render free tier** — files written to `Backend/uploads/`
  are wiped on every redeploy/restart. For persistent image storage, wire up
  Cloudinary (env placeholders already exist in `.env.example`).
- **CORS is locked down** to `https://flinkserve.web.app` +
  `https://flinkserve.firebaseapp.com` (+ localhost for dev). To allow other
  domains, extend `CORS_ORIGIN` (comma-separated) in the Render dashboard.
- **Never commit real secrets.** `.gitignore` already excludes `Backend/.env`
  and `frontend/.env*` (except `.env.example`).
