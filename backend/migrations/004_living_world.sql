-- 004_living_world.sql
-- Phase F+G: the living world's social state.
--
-- location_memories: reactions left at expedition locations (G4). One per
-- player per location, whitelist-validated server-side.
--
-- rare_memory: one row per day. The location is deterministic (derived
-- from the day, see shared/world-memory.ts) and the FIRST explorer to
-- discover it is recorded. Duplicate discovery is rejected.

CREATE TABLE IF NOT EXISTS location_memories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  reaction   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_location_player UNIQUE (location_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_location_memories_location ON location_memories (location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rare_memory (
  day           DATE PRIMARY KEY,
  location_id   TEXT NOT NULL,
  discovered_by TEXT,
  discovered_at TIMESTAMPTZ
);
