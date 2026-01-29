# Quick Start Guide

Get Daily Grid HQ up and running in minutes!

## Prerequisites

- Node.js 18+ installed
- Cloudflare account (for deployment)
- (Optional) Moltbot or other MCP-compatible AI client

## Local Development Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd daily-grid-hq
npm install
```

### 2. Initialize Database

```bash
# Create local D1 database
wrangler d1 execute DB --local --file=scripts/init-db.sql
```

### 3. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:8796` (or the port shown in terminal).

### 4. Open in Browser

Navigate to the URL shown in your terminal. You should see the kanban board!

## First Steps

1. **Create a card:** Type a task name and click "Add" or press `n` to focus the input
2. **Move cards:** Drag cards between columns or use the dropdown menu
3. **Edit cards:** Click any card to open the detail modal
4. **Search:** Press `/` to search cards by title, description, or labels
5. **Keyboard shortcuts:** Press `?` to see all available shortcuts

## Setting Up MCP Integration (Optional)

### 1. Build MCP Server

```bash
cd mcp-server
npm install
npm run build
```

### 2. Configure Environment

Create `mcp-server/.env`:

```env
KANBAN_API_URL=http://localhost:8796
KANBAN_API_TOKEN=
```

### 3. Configure Your AI Client

See [`MOLTBOT_INTEGRATION.md`](MOLTBOT_INTEGRATION.md) for detailed instructions.

## Deployment to Cloudflare Pages

### 1. Create D1 Database

```bash
wrangler d1 create daily-grid-hq-db
```

Copy the database ID from the output.

### 2. Update Configuration

Edit `wrangler.toml` and replace `REPLACE_ME` with your database ID.

### 3. Initialize Production Database

```bash
wrangler d1 execute DB --file=scripts/init-db.sql
```

### 4. Deploy

```bash
npm run deploy
```

### 5. Configure Environment Variables

In Cloudflare Pages dashboard:
- Go to your project → Settings → Environment Variables
- Add `ALLOWED_EMAILS` (comma-separated emails, optional)
- Add `API_TOKEN` or `KANBAN_API_TOKEN` (optional, for API access)

### 6. Set Up Cloudflare Access (Recommended)

1. Go to Cloudflare Zero Trust dashboard
2. Create an Access application
3. Protect your Pages URL
4. Add allowed email addresses

## Troubleshooting

### Database Errors

- Ensure D1 database is created: `wrangler d1 list`
- Check database ID in `wrangler.toml` matches your database
- Verify migration applied: `wrangler d1 execute DB --command "PRAGMA table_info(cards);"`

### Cards Not Appearing

- Check browser console for errors
- Verify API endpoints work: `curl http://localhost:8796/api/cards`
- Ensure database has data: `wrangler d1 execute DB --command "SELECT COUNT(*) FROM cards;"`

### MCP Server Not Connecting

- Verify MCP server built: `ls mcp-server/dist/index.js`
- Check `KANBAN_API_URL` is correct and accessible
- Review AI client logs for connection errors
- Test API directly: `curl $KANBAN_API_URL/api/cards`

### Authentication Issues

- For local dev: Leave `ALLOWED_EMAILS` empty
- For production: Set `ALLOWED_EMAILS` or configure Cloudflare Access
- For API access: Set `API_TOKEN` environment variable

## Next Steps

- Read [`README.md`](README.md) for full documentation
- See [`MOLTBOT_INTEGRATION.md`](MOLTBOT_INTEGRATION.md) for AI integration
- Check [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md) if upgrading from an older version

## Getting Help

- Check the main `README.md` for detailed docs
- Review `MOLTBOT_INTEGRATION.md` for MCP setup
- See Cloudflare D1 docs for database issues
- Check browser console and server logs for errors

Happy kanban managing! 🎯
