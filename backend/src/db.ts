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
