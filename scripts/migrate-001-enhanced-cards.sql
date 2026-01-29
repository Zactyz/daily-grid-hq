-- Migration 001: Enhanced card model
-- Adds description, labels, due_date, archived, and priority fields

-- Add new columns (using ALTER TABLE with IF NOT EXISTS equivalent)
-- SQLite doesn't support IF NOT EXISTS on ALTER TABLE, so we'll use a different approach
-- We'll check and add columns conditionally

-- Note: SQLite has limited ALTER TABLE support, so we'll need to handle this carefully
-- For production, you may need to recreate the table if columns already exist

ALTER TABLE cards ADD COLUMN description TEXT;
ALTER TABLE cards ADD COLUMN labels TEXT; -- JSON array of label strings
ALTER TABLE cards ADD COLUMN due_date INTEGER; -- Unix timestamp
ALTER TABLE cards ADD COLUMN archived INTEGER DEFAULT 0; -- Soft delete (0 = false, 1 = true)
ALTER TABLE cards ADD COLUMN priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- Update existing cards to have archived = 0
UPDATE cards SET archived = 0 WHERE archived IS NULL;

-- Create index for archived status filtering
CREATE INDEX IF NOT EXISTS idx_cards_archived ON cards(archived);

-- Create index for due_date (for filtering overdue tasks)
CREATE INDEX IF NOT EXISTS idx_cards_due_date ON cards(due_date);
