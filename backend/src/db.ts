// Database access. PostgreSQL is the source of truth for contributions.
import { Pool } from 'pg'

export function createPool(connectionString: string | undefined): Pool {
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000
  })
}

// Total contribution count. One cheap indexed COUNT.
export async function countContributions(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM contributions'
  )
  return rows[0].count
}

// Insert one contribution, then return the new total.
// Two sequential statements: a data-modifying CTE racing the outer COUNT
// was returning a stale count, so keep insert and count separate.
export async function insertContribution(pool: Pool, playerId: string): Promise<number> {
  await pool.query('INSERT INTO contributions (player_id) VALUES ($1)', [playerId])
  const { rows } = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM contributions'
  )
  return rows[0].count
}

// --- Memory Stones ---------------------------------------------------------

export interface StoneSummary {
  id: string
  memoryCount: number
}

export interface StoneMemory {
  playerId: string
  reaction: string
  createdAt: string
}

// All stones with their memory counts. Empty stones are included: the scene
// needs the full list to place its labels, even when nobody has visited yet.
export async function listStones(pool: Pool): Promise<StoneSummary[]> {
  const { rows } = await pool.query<{ id: string; count: number }>(
    `SELECT s.id, COUNT(m.id)::int AS count
     FROM memory_stones s
     LEFT JOIN stone_memories m ON m.stone_id = s.id
     GROUP BY s.id
     ORDER BY s.id`
  )
  return rows.map((r) => ({ id: r.id, memoryCount: r.count }))
}

// Memory history for one stone, newest first. The server orders, the client
// never re-sorts.
export async function getStoneMemories(pool: Pool, stoneId: string): Promise<StoneMemory[]> {
  const { rows } = await pool.query<{ player_id: string; reaction: string; created_at: Date }>(
    `SELECT player_id, reaction, created_at
     FROM stone_memories
     WHERE stone_id = $1
     ORDER BY created_at DESC, id DESC`,
    [stoneId]
  )
  return rows.map((r) => ({
    playerId: r.player_id,
    reaction: r.reaction,
    createdAt: r.created_at.toISOString()
  }))
}

// Insert one memory. The UNIQUE(stone_id, player_id) constraint rejects
// duplicates; callers translate the constraint violation into a 409.
export async function insertStoneMemory(
  pool: Pool,
  stoneId: string,
  playerId: string,
  reaction: string
): Promise<void> {
  await pool.query(
    'INSERT INTO stone_memories (stone_id, player_id, reaction) VALUES ($1, $2, $3)',
    [stoneId, playerId, reaction]
  )
}

// The memory this player already left on this stone, if any.
export async function getPlayerMemory(
  pool: Pool,
  stoneId: string,
  playerId: string
): Promise<StoneMemory | null> {
  const { rows } = await pool.query<{ player_id: string; reaction: string; created_at: Date }>(
    `SELECT player_id, reaction, created_at
     FROM stone_memories
     WHERE stone_id = $1 AND player_id = $2`,
    [stoneId, playerId]
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return { playerId: r.player_id, reaction: r.reaction, createdAt: r.created_at.toISOString() }
}

// --- Living World (Phase F+G) ------------------------------------------------

// Community activity totals: the raw inputs for the world memory level and
// landmark progression. All derived from existing tables, never stored.
export interface CommunityActivityRow {
  contributions: number
  stoneMemories: number
  completedExpeditions: number
}

export async function communityActivity(pool: Pool): Promise<CommunityActivityRow> {
  const { rows } = await pool.query<{
    contributions: number
    stone_memories: number
    completed_expeditions: number
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM contributions) AS contributions,
       (SELECT COUNT(*)::int FROM stone_memories) AS stone_memories,
       (SELECT COUNT(*)::int FROM expedition_progress WHERE completed_at IS NOT NULL) AS completed_expeditions`
  )
  const r = rows[0]
  return {
    contributions: r.contributions,
    stoneMemories: r.stone_memories,
    completedExpeditions: r.completed_expeditions
  }
}

export interface LocationMemory {
  playerId: string
  reaction: string
  createdAt: string
}

// All reactions at a location, newest first.
export async function getLocationMemories(pool: Pool, locationId: string): Promise<LocationMemory[]> {
  const { rows } = await pool.query<{ player_id: string; reaction: string; created_at: Date }>(
    `SELECT player_id, reaction, created_at
     FROM location_memories
     WHERE location_id = $1
     ORDER BY created_at DESC, id DESC`,
    [locationId]
  )
  return rows.map((r) => ({ playerId: r.player_id, reaction: r.reaction, createdAt: r.created_at.toISOString() }))
}

export async function countLocationMemories(pool: Pool, locationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM location_memories WHERE location_id = $1',
    [locationId]
  )
  return rows[0].count
}

// The reaction this player already left at a location, if any.
export async function getLocationMemory(pool: Pool, locationId: string, playerId: string): Promise<LocationMemory | null> {
  const { rows } = await pool.query<{ player_id: string; reaction: string; created_at: Date }>(
    `SELECT player_id, reaction, created_at
     FROM location_memories
     WHERE location_id = $1 AND player_id = $2`,
    [locationId, playerId]
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return { playerId: r.player_id, reaction: r.reaction, createdAt: r.created_at.toISOString() }
}

// Insert a location memory; throws pg error 23505 on duplicate.
export async function insertLocationMemory(pool: Pool, locationId: string, playerId: string, reaction: string): Promise<void> {
  await pool.query(
    'INSERT INTO location_memories (location_id, player_id, reaction) VALUES ($1, $2, $3)',
    [locationId, playerId, reaction]
  )
}

// Rare memory: today's deterministic location + discovery state. The
// caller passes the day's deterministic rare location (from
// shared/world-memory.ts rareLocationForDay); the row is created with it
// so every player reads the same location.
export async function getRareMemory(
  pool: Pool,
  day: string,
  locationId: string
): Promise<{ locationId: string; discovered: boolean; discoveredBy: string | null }> {
  await pool.query(
    `INSERT INTO rare_memory (day, location_id)
     VALUES ($1::date, $2)
     ON CONFLICT (day) DO NOTHING`,
    [day, locationId]
  )
  const { rows } = await pool.query<{ location_id: string; discovered_by: string | null }>(
    `SELECT location_id, discovered_by FROM rare_memory WHERE day = $1::date`,
    [day]
  )
  const r = rows[0]
  return { locationId: r.location_id, discovered: r.discovered_by !== null, discoveredBy: r.discovered_by }
}

// Record the first discovery of today's rare memory. Returns false if
// already discovered. The caller validates locationId == today's rare spot.
export async function discoverRareMemory(pool: Pool, day: string, locationId: string, playerId: string): Promise<boolean> {
  const { rows } = await pool.query<{ location_id: string }>(
    `UPDATE rare_memory
     SET discovered_by = $3, discovered_at = now()
     WHERE day = $1::date AND location_id = $2 AND discovered_by IS NULL
     RETURNING location_id`,
    [day, locationId, playerId]
  )
  return rows.length > 0
}

// --- Mission ---------------------------------------------------------------

// Mission progress, server-authoritative and anti-spam by construction:
// one DISTINCT player counts once, whether they contributed to the tree or
// left a stone memory (or both). Derived from existing tables, never
// stored, so nothing can be client-injected and completion persists.
export async function countMissionProgress(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT player_id FROM contributions
       UNION
       SELECT player_id FROM stone_memories
     ) AS participants`
  )
  return rows[0].count
}

// --- Expedition -------------------------------------------------------------

export interface ExpeditionRow {
  collected: number
  guardianHits: number
  completedAt: string | null
}

// Read (or create) today's progress row for a player. Day is a 'YYYY-MM-DD'
// string; pg casts it to DATE safely (validated upstream).
export async function getExpeditionRow(pool: Pool, playerId: string, day: string): Promise<ExpeditionRow> {
  await pool.query(
    `INSERT INTO expedition_progress (player_id, day)
     VALUES ($1, $2::date)
     ON CONFLICT (player_id, day) DO NOTHING`,
    [playerId, day]
  )
  const { rows } = await pool.query<{ collected: number; guardian_hits: number; completed_at: Date | null }>(
    `SELECT collected, guardian_hits, completed_at
     FROM expedition_progress
     WHERE player_id = $1 AND day = $2::date`,
    [playerId, day]
  )
  const r = rows[0]
  return {
    collected: r.collected,
    guardianHits: r.guardian_hits,
    completedAt: r.completed_at ? r.completed_at.toISOString() : null
  }
}

// Add one dispel hit for a fragment slot (0..2). Slots are 2 bits each in
// the SMALLINT (max 3 hits). Addition is the correct increment; the WHERE
// guard refuses to push a slot past 3.
export async function addGuardianHit(pool: Pool, playerId: string, day: string, slot: number): Promise<number> {
  const shift = slot * 2
  const { rows } = await pool.query<{ hits: number }>(
    `UPDATE expedition_progress
     SET guardian_hits = guardian_hits + (1 << $3::int),
         updated_at = now()
     WHERE player_id = $1 AND day = $2::date
       AND ((guardian_hits >> $3::int) & 3) < 3
     RETURNING ((guardian_hits >> $3::int) & 3)::int AS hits`,
    [playerId, day, shift]
  )
  if (rows.length === 0) {
    // already at max for this slot: return the current cap
    const cur = await pool.query<{ hits: number }>(
      `SELECT ((guardian_hits >> $3::int) & 3)::int AS hits
       FROM expedition_progress
       WHERE player_id = $1 AND day = $2::date`,
      [playerId, day, shift]
    )
    return cur.rows[0].hits
  }
  return rows[0].hits
}

// Mark a fragment slot collected (idempotent: OR of the bit).
export async function collectFragment(pool: Pool, playerId: string, day: string, slot: number): Promise<number> {
  const { rows } = await pool.query<{ collected: number }>(
    `UPDATE expedition_progress
     SET collected = collected | (1 << $3::int),
         updated_at = now()
     WHERE player_id = $1 AND day = $2::date
     RETURNING collected::int`,
    [playerId, day, slot]
  )
  return rows[0].collected
}

// Mark the expedition complete for today. Returns the new completion count
// for the day (social proof).
export async function completeExpedition(pool: Pool, playerId: string, day: string): Promise<number> {
  await pool.query(
    `UPDATE expedition_progress
     SET completed_at = now(), updated_at = now()
     WHERE player_id = $1 AND day = $2::date`,
    [playerId, day]
  )
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM expedition_progress WHERE day = $1::date AND completed_at IS NOT NULL`,
    [day]
  )
  return rows[0].count
}
