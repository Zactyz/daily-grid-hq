# Daily Grid HQ

A small shared dashboard for Zac ↔ Friday.

## What it is (MVP)
- Kanban board (Backlog / Doing / Blocked / Done)
- Minimal status panel
- Cloudflare Access–friendly auth model (recommended)

## Auth (recommended)
Protect the app with **Cloudflare Access**.

The API expects the header:
- `Cf-Access-Authenticated-User-Email`

Set `ALLOWED_EMAILS` (comma-separated) as a Pages env var.
- If `ALLOWED_EMAILS` is empty, the API runs in “dev/unconfigured” mode.

## Database
This uses Cloudflare **D1**.

Schema: `scripts/init-db.sql`

## Local development
```bash
npm install
npm run dev
```

Then open the local URL Wrangler prints.

## Deploy
```bash
npm run deploy
```

Notes:
- Update `wrangler.toml` with your real `database_id` after creating the D1 database.
- Add `DB` D1 binding and env vars in Cloudflare Pages project settings.
