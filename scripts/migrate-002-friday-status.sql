-- Add Friday status table

CREATE TABLE IF NOT EXISTS friday_status (
  id TEXT PRIMARY KEY,
  message TEXT,
  mode TEXT,
  focus_card_id TEXT,
  updated_at INTEGER
);
