-- 003_expedition.sql
-- Daily Memory Expedition. One row per player per day.
--   collected     bitmask of fragments collected (bit 0..2 = fragment order
--                 of today's route, set by the server)
--   guardian_hits bitmask-like counters: two bits per fragment guard
--                 (0..3 hits), stored as smallint per fragment slot
--   completed_at  set when the player returns all fragments to the tree
-- The daily seed and fragment locations are DERIVED from the date (see
-- shared/expedition.ts), never stored: deterministic, no drift, nothing to
-- corrupt.

CREATE TABLE IF NOT EXISTS expedition_progress (
  player_id      TEXT NOT NULL,
  day            DATE NOT NULL,
  collected      SMALLINT NOT NULL DEFAULT 0,
  guardian_hits  SMALLINT NOT NULL DEFAULT 0,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, day)
);

CREATE INDEX IF NOT EXISTS idx_expedition_completed ON expedition_progress (day, completed_at)
  WHERE completed_at IS NOT NULL;
