-- Add epic support to cards
ALTER TABLE cards ADD COLUMN is_epic INTEGER DEFAULT 0;
ALTER TABLE cards ADD COLUMN epic_id TEXT;
CREATE INDEX IF NOT EXISTS idx_cards_epic_id ON cards(epic_id);
