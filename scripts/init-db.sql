-- Daily Grid HQ (Kanban + audit-lite)

DROP TABLE IF EXISTS cards;

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('backlog','doing','blocked','done')),
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_cards_status_sort ON cards(status, sort);
