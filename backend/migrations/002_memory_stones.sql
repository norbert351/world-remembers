-- 002_memory_stones.sql
-- Memory Stones: a persistent record of who visited and what they left.
-- One player can leave exactly one memory per stone (UNIQUE constraint).

CREATE TABLE IF NOT EXISTS memory_stones (
  id         TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stone_memories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stone_id   TEXT NOT NULL REFERENCES memory_stones(id) ON DELETE CASCADE,
  player_id  TEXT NOT NULL,
  reaction   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stone_player UNIQUE (stone_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_stone_memories_stone_created ON stone_memories (stone_id, created_at DESC);

-- The three stones, idempotent
INSERT INTO memory_stones (id) VALUES ('garden'), ('tree'), ('ridge')
ON CONFLICT (id) DO NOTHING;
