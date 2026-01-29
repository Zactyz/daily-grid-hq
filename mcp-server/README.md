# Daily Grid HQ MCP Server

MCP (Model Context Protocol) server for managing the Daily Grid HQ kanban board through AI agents like Moltbot, Claude Desktop, or Cursor.

## Installation

```bash
cd mcp-server
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:
```env
KANBAN_API_URL=http://localhost:8796
KANBAN_API_TOKEN=your-token-here  # Optional, only if using Bearer token auth
```

## Running

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## Integration with Moltbot

Add to your `moltbot.json`:

```json
{
  "mcp": {
    "servers": {
      "daily-grid-hq": {
        "command": "node",
        "args": ["/path/to/daily-grid-hq/mcp-server/dist/index.js"],
        "env": {
          "KANBAN_API_URL": "https://your-kanban-board.pages.dev",
          "KANBAN_API_TOKEN": "your-token-if-needed"
        }
      }
    }
  }
}
```

## Integration with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "daily-grid-hq": {
      "command": "node",
      "args": ["/path/to/daily-grid-hq/mcp-server/dist/index.js"],
      "env": {
        "KANBAN_API_URL": "https://your-kanban-board.pages.dev",
        "KANBAN_API_TOKEN": "your-token-if-needed"
      }
    }
  }
}
```

## Available Tools

- `list_cards` - List all cards, optionally filtered by status
- `create_card` - Create a new card
- `update_card` - Update card properties
- `move_card` - Move a card to a different status
- `archive_card` - Archive (soft delete) a card
- `get_board_summary` - Get board statistics

See `MOLTBOT_INTEGRATION.md` in the project root for detailed usage examples.
