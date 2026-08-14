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
