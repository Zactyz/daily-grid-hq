# Migration Guide

This guide helps you migrate from the original Daily Grid HQ to the enhanced version with new features.

## Database Migration

If you have an existing database, you need to apply the migration to add new columns:

### Step 1: Backup Your Data

Before migrating, export your existing data:

```bash
# Export cards table
wrangler d1 execute DB --command "SELECT * FROM cards;" --json > backup.json
```

### Step 2: Apply Migration

**Local Development:**
```bash
wrangler d1 execute DB --local --file=scripts/migrate-001-enhanced-cards.sql
```

**Production:**
```bash
wrangler d1 execute DB --file=scripts/migrate-001-enhanced-cards.sql
```

### Step 3: Verify Migration

Check that the new columns exist:

```bash
wrangler d1 execute DB --command "PRAGMA table_info(cards);"
```

You should see the new columns:
- `description`
- `labels`
- `due_date`
- `archived`
- `priority`

### Step 4: Update Existing Cards (Optional)

Set default values for existing cards:

```sql
UPDATE cards SET archived = 0 WHERE archived IS NULL;
```

## What Changed

### New Features

1. **Enhanced Card Model**
   - Cards can now have descriptions
   - Labels/tags support
   - Due dates with overdue detection
   - Priority levels
   - Archive (soft delete) instead of permanent deletion

2. **Drag-and-Drop**
   - Cards can be dragged between columns
   - Cards can be reordered within columns

3. **Keyboard Shortcuts**
   - `n` - Focus new card input
   - `?` - Show shortcuts
   - `Esc` - Close modals

4. **Real-Time Updates**
   - Board polls for changes every 30 seconds
   - Shows notifications when updates are detected

5. **MCP Integration**
   - AI agents can manage the board via Model Context Protocol
   - See `MOLTBOT_INTEGRATION.md` for setup

### Breaking Changes

**None!** The migration is fully backwards compatible. Existing cards will work with default values for new fields.

### API Changes

**New Endpoints:**
- `POST /api/cards/:id/archive` - Archive a card (soft delete)

**Enhanced Endpoints:**
- `GET /api/cards` - Now supports `?archived=true` query parameter
- `POST /api/cards` - Now accepts `description`, `labels`, `dueDate`, `priority`, `status`
- `PATCH /api/cards/:id` - Now supports all new fields

**Authentication:**
- Added Bearer token support (`Authorization: Bearer <token>`)
- Existing Cloudflare Access auth still works

## Rollback Plan

If you need to rollback:

1. **Restore from backup:**
   ```bash
   # Drop and recreate table
   wrangler d1 execute DB --file=scripts/init-db.sql
   
   # Restore data (you'll need to write a script to insert from backup.json)
   ```

2. **Revert code:**
   ```bash
   git checkout <previous-commit>
   npm run deploy
   ```

## Troubleshooting

### Migration Fails

If the migration fails with "duplicate column" errors, the columns may already exist. Check with:

```bash
wrangler d1 execute DB --command "PRAGMA table_info(cards);"
```

If columns exist, you can skip the migration or modify it to use `IF NOT EXISTS` equivalents.

### Cards Not Showing

- Check that `archived` column exists and defaults to 0
- Verify cards aren't accidentally archived
- Check browser console for errors

### API Errors

- Ensure migration completed successfully
- Check that all new columns exist in database
- Verify API endpoints match new schema

## Need Help?

- Check the main `README.md` for general setup
- See `MOLTBOT_INTEGRATION.md` for MCP setup
- Review Cloudflare D1 documentation for database issues
