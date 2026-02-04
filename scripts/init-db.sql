-- Daily Grid HQ (Kanban + audit-lite)

DROP TABLE IF EXISTS cards;

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('backlog','doing','blocked','done')),
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  description TEXT,
  labels TEXT, -- JSON array of label strings
  due_date INTEGER, -- Unix timestamp
  archived INTEGER DEFAULT 0, -- Soft delete (0 = false, 1 = true)
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  is_epic INTEGER DEFAULT 0, -- 1 = epic card, 0 = normal card
  epic_id TEXT -- optional parent epic id
);

CREATE INDEX idx_cards_status_sort ON cards(status, sort);
CREATE INDEX idx_cards_archived ON cards(archived);
CREATE INDEX idx_cards_due_date ON cards(due_date);
CREATE INDEX idx_cards_epic_id ON cards(epic_id);

-- Friday status
CREATE TABLE IF NOT EXISTS friday_status (
  id TEXT PRIMARY KEY,
  message TEXT,
  mode TEXT,
  focus_card_id TEXT,
  updated_at INTEGER
);

-- Comments (flat list; optional parent_id for future threading)
CREATE TABLE IF NOT EXISTS card_comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  parent_id TEXT,
  author_email TEXT,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card_comments_card_id_created_at ON card_comments(card_id, created_at);

-- Attachments metadata (binaries stored in R2)
CREATE TABLE IF NOT EXISTS card_attachments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  author_email TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card_attachments_card_id_created_at ON card_attachments(card_id, created_at);
