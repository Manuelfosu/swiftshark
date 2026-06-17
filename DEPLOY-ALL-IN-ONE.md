# Host EVERYTHING Together on One Site (Free) — Beginner Guide

This hosts your **front-end + backend + database** as **one app on one URL**.
No splitting, no CORS, no cookie tweaks — because your server already serves the
website AND the `/api` AND the SQLite database together.

We’ll use **Render** (free tier, easiest). Railway and Fly.io also work — see the
bottom for notes.

---

## How it works (why one service is enough)

```
            https://swift-investments.onrender.com
                          │
                          ▼
                     server.js (Node)
               ├─ serves the website  (public/index.html)
               ├─ answers /api/...    (login, deposit, plans…)
               └─ reads/writes        swift.db (database)
```

One address does everything. 🎉

---

## Step 1 — Put the project on GitHub (one time)

Render deploys from a GitHub repo.

1. Create a free account at **https://github.com**.
2. Click **+** → **New repository**, name it `swift-investments`, make it **Public**, **Create repository**.
3. On the empty repo page, click **“uploading an existing file”**, drag in the
   **whole `swift-investments` folder contents** (including the `server` folder
   and `render.yaml`), then **Commit changes**.

---

## Step 2 — Deploy on Render (the easy “Blueprint” way)

This project includes a **`render.yaml`** so Render configures itself.

1. Go to **https://render.com** → sign up (you can use your GitHub account).
2. Click **New +** → **Blueprint**.
3. Select your `swift-investments` repository → **Connect**.
4. Render reads `render.yaml` and shows a service named **swift-investments**
   (Runtime: Node, Plan: Free). Click **Apply** / **Create**.
5. Wait until the status says **Live**.

### Don’t see a Blueprint option? Do it manually (still easy):
1. **New +** → **Web Service** → connect the repo.
2. Set:
   - **Root Directory:** `server`
   - **Build Command:** *(leave blank)*
   - **Start Command:** `node --no-warnings server.js`
   - **Instance Type:** **Free**
3. Under **Environment**, add a variable: **NODE_VERSION = 22.12.0**
   *(Required — the database feature needs Node 22+.)*
4. **Create Web Service**.

---

## Step 3 — Open your live site

Render gives you a URL like:

```
https://swift-investments.onrender.com
```

Open it — the full app is live: landing page, login, dashboard, VIP plans, deposit,
withdraw — all powered by the real database. Log in with the seeded demo account:

- Email: `demo@swift.io`
- Password: `demo1234`

…or **Register** a real account. Deposits, plan subscriptions, and transactions are
saved to the database on the server.

> First load after the app has been idle may take ~30 seconds — Render’s free tier
> “sleeps” inactive apps and wakes them on the next visit. That’s normal.

---

## Step 4 (IMPORTANT) — Make the database permanent

On the **free** tier the server’s disk is **temporary**: `swift.db` is recreated
(and re-seeded with the demo data) every time the app redeploys or wakes from sleep.
Great for demos and testing; **not** for keeping real user data.

To make data permanent you have two options:

### Option A — Add a persistent disk (simplest; small monthly cost)
Persistent disks on Render require a paid instance (e.g. **Starter**). To enable:
1. Open **`render.yaml`** in your repo and **uncomment** the `disk:` block and the
   `DB_FILE` variable, and change `plan: free` to `plan: starter`.
2. Commit. Render redeploys with a `/data` disk and stores the database at
   `/data/swift.db`, which survives restarts and redeploys.
   *(The server already reads the `DB_FILE` env var — no code change needed.)*

### Option B — Use a managed database (free Postgres)
For a fully free permanent database, create a Postgres database (Render → **New +**
→ **PostgreSQL**) and switch the server’s queries to it. The SQL is almost identical
to the current SQLite; this is the recommended path once you have real users.

For now, you can launch on free and decide later — nothing else needs changing.

---

## Updating the site after changes

Edit the design in `preview/index.html`, copy it over `server/public/index.html`,
commit to GitHub. Render auto-redeploys in ~1 minute.

```bash
cp preview/index.html server/public/index.html      # Mac/Linux
copy preview\index.html server\public\index.html    # Windows
```

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| Build fails mentioning `node:sqlite` | NODE_VERSION isn’t set to 22+. Add **NODE_VERSION = 22.12.0** in the service’s Environment and redeploy. |
| “Not found … copy the front-end” page | `server/public/index.html` wasn’t uploaded. Make sure the `server/public` folder is in your repo. |
| App slow on first visit | Free tier woke from sleep (~30s). Normal. |
| My deposits reset later | Expected on free tier — see Step 4 to make the database permanent. |
| Styles/charts missing | The app loads React/Tailwind/Chart.js from the internet; the visitor must be online. |

---

## Other one-service hosts (alternatives)

- **Railway** (https://railway.app): New Project → Deploy from GitHub → set root to
  `server`, start command `node --no-warnings server.js`. Supports a **Volume** you
  can mount at `/data` for a permanent database (set `DB_FILE=/data/swift.db`).
- **Fly.io** (https://fly.io): `fly launch` from the `server` folder; add a volume
  for `/data`. More powerful but uses the command line.

All of them run the exact same `server.js` — everything stays together on one URL. 🚀
