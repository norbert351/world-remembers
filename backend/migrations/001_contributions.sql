-- 001_contributions.sql
-- One table. Tree stage is derived state, never stored.

CREATE TABLE IF NOT EXISTS contributions (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions (created_at);
CREATE INDEX IF NOT EXISTS idx_contributions_player_id ON contributions (player_id);
