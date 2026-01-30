-- Migration 003: Comments + attachments

-- Flat comment list (optionally supports threads via parent_id)
CREATE TABLE IF NOT EXISTS card_comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  parent_id TEXT,
  author_email TEXT,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_comments_card_id_created_at ON card_comments(card_id, created_at);

-- Attachments metadata; binaries stored in R2
CREATE TABLE IF NOT EXISTS card_attachments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  kind TEXT NOT NULL, -- 'image'
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  author_email TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_attachments_card_id_created_at ON card_attachments(card_id, created_at);
