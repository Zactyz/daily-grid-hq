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
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE INDEX idx_cards_status_sort ON cards(status, sort);
CREATE INDEX idx_cards_archived ON cards(archived);
CREATE INDEX idx_cards_due_date ON cards(due_date);
