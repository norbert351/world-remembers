// Express app factory. The pool is injected so tests can pass a real or a
// broken pool.
import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import type { Pool } from 'pg'
import { stageFor } from '../../shared/world-state'
import { isReactionId, isStoneId } from '../../shared/stones'
import {
  countContributions,
  getPlayerMemory,
  getStoneMemories,
  insertContribution,
  insertStoneMemory,
  listStones
} from './db'

// DCL player ids are eth addresses: 0x + 40 hex chars. No wallet prompts,
// the explorer exposes the session identity without any user action.
const PLAYER_ID_RE = /^0[xX][a-fA-F0-9]{40}$/

const JSON_LIMIT = '10kb'

function parsePlayerId(body: unknown): { playerId: string } | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'body must be a JSON object' }
  }
  const keys = Object.keys(body)
  if (keys.length === 0) return { error: 'playerId is required' }
  if (keys.some((k) => k !== 'playerId')) {
    return { error: 'unexpected fields are not allowed' }
  }
  const raw = (body as Record<string, unknown>).playerId
  if (typeof raw !== 'string' || !PLAYER_ID_RE.test(raw)) {
    return { error: 'playerId must be a valid 0x Ethereum address' }
  }
  return { playerId: raw.toLowerCase() }
}

// Memory submission body: exactly { playerId, reaction }. Both fields are
// required, the reaction must be on the fixed whitelist, and no other
// fields are accepted.
function parseMemoryBody(body: unknown): { playerId: string; reaction: string } | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'body must be a JSON object' }
  }
  const keys = Object.keys(body)
  if (keys.length === 0) return { error: 'playerId and reaction are required' }
  if (keys.some((k) => k !== 'playerId' && k !== 'reaction')) {
    return { error: 'unexpected fields are not allowed' }
  }
  const raw = body as Record<string, unknown>
  if (typeof raw.playerId !== 'string' || !PLAYER_ID_RE.test(raw.playerId)) {
    return { error: 'playerId must be a valid 0x Ethereum address' }
  }
  if (!isReactionId(raw.reaction)) {
    return { error: 'reaction must be one of: found, beautiful, return, someone' }
  }
  return { playerId: raw.playerId.toLowerCase(), reaction: raw.reaction }
}

export function createApp(pool: Pool) {
  const app = express()
  app.disable('x-powered-by')

  const origins = (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  // cors treats '*' only as a plain string; an array of ['*'] would not match
  const corsOrigin: string | string[] = origins.includes('*') ? '*' : origins
  app.use(cors({ origin: corsOrigin }))
  app.use(express.json({ limit: JSON_LIMIT }))

  // Health: does the API answer, and can it reach the database?
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1')
      res.json({ status: 'ok', db: 'up' })
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' })
    }
  })

  // World state: contribution count + derived tree stage.
  app.get('/world', async (_req: Request, res: Response) => {
    try {
      const contributions = await countContributions(pool)
      res.json({ contributions, stage: stageFor(contributions) })
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // One contribution. The server decides validity; clients can never
  // submit a count or any other field.
  app.post('/contribute', async (req: Request, res: Response) => {
    const parsed = parsePlayerId(req.body)
    if ('error' in parsed) {
      res.status(400).json({ success: false, error: parsed.error })
      return
    }
    try {
      const contributions = await insertContribution(pool, parsed.playerId)
      res.json({ success: true, contributions, stage: stageFor(contributions) })
    } catch {
      res.status(500).json({ success: false, error: 'internal_error' })
    }
  })

  // --- Memory Stones -------------------------------------------------------

  // All stones with their memory counts. The scene needs every stone even
  // when some have no memories yet, to place the in-world labels.
  app.get('/stones', async (_req: Request, res: Response) => {
    try {
      const stones = await listStones(pool)
      res.json({ stones })
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // One stone: summary + full memory history, newest first.
  app.get('/stones/:stoneId', async (req: Request, res: Response) => {
    const stoneId = req.params.stoneId
    if (!isStoneId(stoneId)) {
      res.status(404).json({ error: 'unknown_stone' })
      return
    }
    try {
      const [stone] = (await listStones(pool)).filter((s) => s.id === stoneId)
      const memories = await getStoneMemories(pool, stoneId)
      res.json({ stone, memories })
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // Leave one memory on a stone. Body: { playerId, reaction }.
  // Exactly one memory per player per stone, enforced by the UNIQUE
  // constraint; a duplicate gets a 409 with the existing memory so the
  // client can show "you already left a memory here".
  app.post('/stones/:stoneId/memories', async (req: Request, res: Response) => {
    const stoneId = req.params.stoneId
    if (!isStoneId(stoneId)) {
      res.status(404).json({ error: 'unknown_stone' })
      return
    }
    const parsed = parseMemoryBody(req.body)
    if ('error' in parsed) {
      res.status(400).json({ success: false, error: parsed.error })
      return
    }
    const { playerId, reaction } = parsed
    try {
      await insertStoneMemory(pool, stoneId, playerId, reaction)
      const memories = await getStoneMemories(pool, stoneId)
      res.status(201).json({
        success: true,
        stoneId,
        playerId,
        reaction,
        memoryCount: memories.length,
        memories
      })
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        // unique violation: this player already left a memory on this stone
        const existing = await getPlayerMemory(pool, stoneId, playerId)
        res.status(409).json({
          success: false,
          error: 'already_left_memory',
          memory: existing
        })
        return
      }
      res.status(500).json({ success: false, error: 'internal_error' })
    }
  })

  // Malformed JSON and oversized bodies land here before any handler.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'invalid_json' })
      return
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large' })
      return
    }
    res.status(500).json({ error: 'internal_error' })
  })

  return app
}
