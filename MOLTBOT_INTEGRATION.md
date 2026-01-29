# Daily Grid HQ - Moltbot Integration Guide

## Overview

Daily Grid HQ kanban board can be controlled by Moltbot (or any MCP-compatible AI agent) through the Model Context Protocol (MCP). This allows you to manage your kanban board using natural language commands in your AI assistant.

## Quick Start

### 1. Install the MCP Server

First, ensure you have Node.js installed (v18 or higher). Then:

```bash
cd mcp-server
npm install
npm run build
```

### 2. Configure Environment Variables

Create a `.env` file in the `mcp-server` directory:

```env
# Required: URL of your deployed kanban board
KANBAN_API_URL=https://your-kanban-board.pages.dev

# Optional: API token if you've configured Bearer token authentication
# Leave empty if using Cloudflare Access or dev mode
KANBAN_API_TOKEN=
```

### 3. Configure Moltbot

Add the MCP server to your Moltbot configuration. Edit your `moltbot.json` (usually located at `~/.clawdbot/moltbot.json`):

```json
{
  "mcp": {
    "servers": {
      "daily-grid-hq": {
        "command": "node",
        "args": ["/absolute/path/to/daily-grid-hq/mcp-server/dist/index.js"],
        "env": {
          "KANBAN_API_URL": "https://your-kanban-board.pages.dev",
          "KANBAN_API_TOKEN": ""
        }
      }
    }
  }
}
```

**Important:** Use the absolute path to the compiled `index.js` file in the `dist` directory.

### 4. Restart Moltbot Gateway

After adding the MCP server configuration, restart your Moltbot gateway:

```bash
moltbot gateway restart
```

Or if running manually:

```bash
# Stop the current gateway
# Then start it again
moltbot gateway
```

### 5. Test the Connection

In your Moltbot chat interface, try:

```
Show me all cards in the backlog
```

If configured correctly, Moltbot should be able to query your kanban board and return the list of cards.

## Available Commands

### Natural Language Examples

You can interact with your kanban board using natural language. Here are some examples:

**Viewing Cards:**
- "Show me all cards in the backlog"
- "What cards are in the doing column?"
- "List all blocked tasks"
- "Show me everything that's done"
- "What's overdue right now?"

**Creating Cards:**
- "Create a new card called 'Fix login bug' in the doing column"
- "Add a task 'Review PR #123' to backlog with high priority"
- "Create a card 'Update documentation' with due date 2026-02-15"
- "Add a task 'Test new feature' with labels 'bug' and 'urgent'"

**Updating Cards:**
- "Move card abc-123 to done"
- "Update card xyz-789 to high priority"
- "Change the title of card def-456 to 'New title'"
- "Add description 'This is important' to card abc-123"
- "Set due date 2026-02-20 for card xyz-789"

**Managing Cards:**
- "Archive the card about the old feature"
- "What's the status of card abc-123?"
- "Give me a summary of the board"
- "How many cards are in each column?"

### Tool Reference

The MCP server exposes the following tools:

#### `list_cards`

List all kanban cards, optionally filtered by status.

**Parameters:**
- `status` (optional): Filter by status (`backlog`, `doing`, `blocked`, `done`)
- `includeArchived` (optional): Include archived cards (default: `false`)

**Example:**
```json
{
  "status": "doing",
  "includeArchived": false
}
```

#### `create_card`

Create a new kanban card.

**Parameters:**
- `title` (required): Card title
- `description` (optional): Card description
- `status` (optional): Initial status (default: `backlog`)
- `priority` (optional): Priority level (`low`, `medium`, `high`, `urgent`)
- `labels` (optional): Array of label strings
- `dueDate` (optional): Due date in ISO format (YYYY-MM-DD)

**Example:**
```json
{
  "title": "Fix login bug",
  "description": "Users cannot log in with Google OAuth",
  "status": "doing",
  "priority": "high",
  "labels": ["bug", "auth"],
  "dueDate": "2026-02-15"
}
```

#### `update_card`

Update an existing card. Only provide fields you want to change.

**Parameters:**
- `id` (required): Card ID
- `title` (optional): New title
- `description` (optional): New description
- `status` (optional): New status
- `priority` (optional): New priority (or `null` to remove)
- `labels` (optional): New labels array
- `dueDate` (optional): New due date (or `null` to remove)

**Example:**
```json
{
  "id": "abc-123-def-456",
  "status": "done",
  "priority": null
}
```

#### `move_card`

Move a card to a different status column (convenience method).

**Parameters:**
- `id` (required): Card ID
- `status` (required): Target status

**Example:**
```json
{
  "id": "abc-123-def-456",
  "status": "done"
}
```

#### `archive_card`

Archive a card (soft delete). Archived cards are hidden by default.

**Parameters:**
- `id` (required): Card ID

**Example:**
```json
{
  "id": "abc-123-def-456"
}
```

#### `get_board_summary`

Get high-level board statistics.

**Parameters:** None

**Returns:**
```json
{
  "total": 15,
  "byStatus": {
    "backlog": 5,
    "doing": 3,
    "blocked": 2,
    "done": 5
  },
  "overdue": 1,
  "byPriority": {
    "low": 2,
    "medium": 5,
    "high": 3,
    "urgent": 1
  }
}
```

## Configuration

### Environment Variables

The MCP server uses the following environment variables:

- **KANBAN_API_URL** (required): The URL of your deployed kanban board
  - Example: `https://daily-grid-hq.pages.dev`
  - For local development: `http://localhost:8796`

- **KANBAN_API_TOKEN** (optional): API token for Bearer token authentication
  - Only needed if you've configured API token auth in your Cloudflare Pages environment
  - Leave empty if using Cloudflare Access or dev mode

### Moltbot Config

The MCP server should be configured in your `moltbot.json`:

```json
{
  "mcp": {
    "servers": {
      "daily-grid-hq": {
        "command": "node",
        "args": ["/absolute/path/to/daily-grid-hq/mcp-server/dist/index.js"],
        "env": {
          "KANBAN_API_URL": "https://your-kanban-board.pages.dev",
          "KANBAN_API_TOKEN": ""
        }
      }
    }
  }
}
```

**Note:** You can also set environment variables in your shell and reference them, but it's recommended to set them in the config for portability.

## Authentication

The kanban board API supports two authentication methods:

1. **Cloudflare Access** (recommended for web UI)
   - Uses `Cf-Access-Authenticated-User-Email` header
   - Configured via Cloudflare Pages dashboard

2. **Bearer Token** (recommended for MCP/API access)
   - Uses `Authorization: Bearer <token>` header
   - Set `API_TOKEN` or `KANBAN_API_TOKEN` environment variable in Cloudflare Pages
   - Set the same value in your MCP server's `KANBAN_API_TOKEN` env var

If neither is configured, the API runs in dev mode and allows all requests.

## Troubleshooting

### "Unknown tool" error

**Problem:** Moltbot reports that the tool doesn't exist.

**Solutions:**
1. Verify the MCP server is running: Check Moltbot logs for connection errors
2. Ensure the path to `index.js` is absolute and correct
3. Verify the server compiled successfully: `cd mcp-server && npm run build`
4. Restart Moltbot gateway after configuration changes

### "Unauthorized" or "401" errors

**Problem:** MCP server cannot authenticate with the kanban API.

**Solutions:**
1. Check `KANBAN_API_URL` is correct and accessible
2. If using Bearer token auth, verify `KANBAN_API_TOKEN` matches the token set in Cloudflare Pages
3. For local development, ensure `ALLOWED_EMAILS` is empty or the API token is set
4. Test the API directly: `curl -H "Authorization: Bearer YOUR_TOKEN" https://your-board.pages.dev/api/cards`

### Connection refused errors

**Problem:** Cannot connect to the kanban API.

**Solutions:**
1. Verify the kanban board is deployed and accessible
2. Check the URL is correct (no trailing slash)
3. For local development, ensure `npm run dev` is running
4. Check firewall/network settings

### Tools not appearing in Moltbot

**Problem:** Tools are configured but don't show up in Moltbot.

**Solutions:**
1. Restart Moltbot gateway completely
2. Check Moltbot logs: `moltbot logs` or check gateway output
3. Verify MCP server starts without errors
4. Try listing tools manually: The server should log available tools on startup

## Advanced Usage

### Automation Examples

You can use Moltbot's automation features to integrate kanban management:

**Cron Job Example:**
```json
{
  "cron": {
    "daily-summary": {
      "schedule": "0 9 * * *",
      "command": "Send a message to the user with the board summary"
    }
  }
}
```

Then in your Moltbot chat:
```
Create a cron job that sends me a daily summary of the kanban board at 9am
```

**Webhook Integration:**
You can configure webhooks to notify Moltbot when cards change, then have Moltbot take actions based on those events.

### Multi-Agent Workflows

With Moltbot's multi-agent capabilities, you can create workflows like:

1. **Code Review Agent:** When a PR is created, automatically create a kanban card
2. **Status Agent:** Monitor blocked cards and notify team members
3. **Planning Agent:** Analyze board statistics and suggest optimizations

### Custom Commands

You can create custom Moltbot commands that combine multiple kanban operations:

```
/kanban-summary - Get a formatted summary of the board
/kanban-blocked - List all blocked cards with details
/kanban-overdue - Show overdue tasks
```

## Best Practices

1. **Use descriptive card titles:** Make it easy for AI to understand what each card is about
2. **Set priorities:** Help AI prioritize work by setting priority levels
3. **Use labels consistently:** Create a label taxonomy and use it consistently
4. **Set due dates:** Enable time-based queries and reminders
5. **Archive completed work:** Keep the board clean by archiving old cards
6. **Regular summaries:** Ask Moltbot for board summaries regularly to stay informed

## Security Considerations

- **API Tokens:** Store API tokens securely, never commit them to version control
- **Access Control:** Use Cloudflare Access for web UI, Bearer tokens for API/MCP access
- **Network:** The MCP server makes HTTP requests to your kanban API - ensure the connection is secure (HTTPS in production)
- **Rate Limiting:** Consider implementing rate limiting if exposing the API publicly

## Support

For issues specific to:
- **MCP Server:** Check `mcp-server/README.md`
- **Kanban Board:** Check the main `README.md`
- **Moltbot:** See [Moltbot Documentation](https://docs.molt.bot/)

## Examples

### Example Conversation

**User:** "Create a new card for fixing the login bug"

**Moltbot:** "I'll create a card for fixing the login bug. What status should it be in - backlog, doing, blocked, or done?"

**User:** "Put it in doing with high priority"

**Moltbot:** "Created card 'Fix login bug' in the doing column with high priority. Card ID: abc-123-def-456"

**User:** "What's blocked right now?"

**Moltbot:** "Here are the blocked cards:
1. Database migration issue (high priority, due 2026-02-10)
2. API rate limiting bug (medium priority)"

**User:** "Move the database migration card to done"

**Moltbot:** "Moved 'Database migration issue' to done."

## Next Steps

1. Set up the MCP server following the Quick Start guide
2. Test basic commands like listing cards
3. Create cards through Moltbot
4. Explore automation possibilities
5. Customize workflows for your team

Happy kanban managing with AI!
