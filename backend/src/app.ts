// Express app factory. The pool is injected so tests can pass a real or a
// broken pool.
import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import type { Pool } from 'pg'
import { stageFor } from '../../shared/world-state'
import { isReactionId, isStoneId } from '../../shared/stones'
import { MISSION } from '../../shared/mission'
import {
  EXPEDITION,
  dailySeed,
  dayKeyFromDate,
  fragmentsForDay,
  isFragmentId,
  type ExpeditionFragmentId
} from '../../shared/expedition'
import {
  landmarkStageFor,
  memoryLevelFor,
  rareLocationForDay,
  isLocationReactionId
} from '../../shared/world-memory'
import { ALL_FRAGMENT_IDS } from '../../shared/expedition'
import {
  addGuardianHit,
  collectFragment,
  communityActivity,
  completeExpedition,
  countContributions,
  countLocationMemories,
  countMissionProgress,
  discoverRareMemory,
  getExpeditionRow,
  getLocationMemory,
  getLocationMemories,
  getPlayerMemory,
  getRareMemory,
  getStoneMemories,
  insertContribution,
  insertLocationMemory,
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

// Expedition action body: exactly { playerId, fragmentId }. Same strictness
// as the contribution/memory parsers: no extra fields, validated identity.
function parseExpeditionBody(body: unknown): { playerId: string; fragmentId: string } | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'body must be a JSON object' }
  }
  const keys = Object.keys(body)
  if (keys.length === 0) return { error: 'playerId and fragmentId are required' }
  if (keys.some((k) => k !== 'playerId' && k !== 'fragmentId')) {
    return { error: 'unexpected fields are not allowed' }
  }
  const raw = body as Record<string, unknown>
  if (typeof raw.playerId !== 'string' || !PLAYER_ID_RE.test(raw.playerId)) {
    return { error: 'playerId must be a valid 0x Ethereum address' }
  }
  if (typeof raw.fragmentId !== 'string' || !isFragmentId(raw.fragmentId)) {
    return { error: 'invalid_fragment' }
  }
  return { playerId: raw.playerId.toLowerCase(), fragmentId: raw.fragmentId }
}

// Mission payload builder. Progress is derived server-side from the
// persistent participant tables; the client only ever reads this.
async function missionPayload(pool: Pool): Promise<{ mission: Record<string, unknown> }> {
  const progress = await countMissionProgress(pool)
  return {
    mission: {
      id: MISSION.id,
      title: MISSION.title,
      description: MISSION.description,
      progress,
      target: MISSION.target,
      completed: progress >= MISSION.target
    }
  }
}

// --- Expedition -------------------------------------------------------------

// Today's fragment route and the player's progress against it.
// Everything derives from the date (seed) + the player's progress row.
async function expeditionPayload(pool: Pool, playerId: string): Promise<Record<string, unknown>> {
  const day = dayKeyFromDate(new Date())
  const route = fragmentsForDay(day)
  const row = await getExpeditionRow(pool, playerId, day)
  const { rows } = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM expedition_progress WHERE day = $1::date AND completed_at IS NOT NULL',
    [day]
  )
  return {
    day,
    seed: dailySeed(day),
    fragments: route.map((id, slot) => ({
      id,
      hits: (row.guardianHits >> (slot * 2)) & 3,
      collected: (row.collected & (1 << slot)) !== 0
    })),
    completed: row.completedAt !== null,
    todayCompletions: rows[0].count
  }
}

// Which slot (0..2) a fragment id occupies today, or -1 if it is not part
// of today's route. The single source of truth for "does this fragment
// belong to today's mission".
function slotFor(route: ExpeditionFragmentId[], id: unknown): number {
  if (!isFragmentId(id)) return -1
  return route.indexOf(id)
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

  // World state: contribution count + derived tree stage + living world
  // (memory level, landmark progress, daily event, rare memory). The
  // client parser only reads `contributions`, so extra fields are safe.
  app.get('/world', async (req: Request, res: Response) => {
    try {
      const contributions = await countContributions(pool)
      const activity = await communityActivity(pool)
      const level = memoryLevelFor(activity)
      const landmark = landmarkStageFor(activity.completedExpeditions)
      const day = dayKeyFromDate(new Date())
      const rareLocation = rareLocationForDay(day, ALL_FRAGMENT_IDS)
      const rare = await getRareMemory(pool, day, rareLocation)
      // the daily pulse "happened" once today's first expedition completed
      const pulse = activity.completedExpeditions > 0
      res.json({
        contributions,
        stage: stageFor(contributions),
        memoryLevel: { level: level.level, name: level.name, score: level.score },
        landmark: { stage: landmark.stage, name: landmark.name },
        dailyEvent: { day, pulse },
        rareMemory: { locationId: rare.locationId, discovered: rare.discovered },
        communityActivity: {
          contributions: activity.contributions,
          stoneMemories: activity.stoneMemories,
          completedExpeditions: activity.completedExpeditions
        }
      })
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // One contribution. The server decides validity; clients can never
  // submit a count or any other field. Mission progress is recalculated
  // server-side and returned with the same response.
  app.post('/contribute', async (req: Request, res: Response) => {
    const parsed = parsePlayerId(req.body)
    if ('error' in parsed) {
      res.status(400).json({ success: false, error: parsed.error })
      return
    }
    try {
      const contributions = await insertContribution(pool, parsed.playerId)
      const mission = await missionPayload(pool)
      res.json({ success: true, contributions, stage: stageFor(contributions), ...mission })
    } catch {
      res.status(500).json({ success: false, error: 'internal_error' })
    }
  })

  // Active mission: id, copy and server-derived progress.
  app.get('/mission', async (_req: Request, res: Response) => {
    try {
      const mission = await missionPayload(pool)
      res.json(mission)
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // --- Expedition -----------------------------------------------------------

  // Today's Memory Expedition for this player: day, seed, fragment route,
  // per-fragment guardian hits + collected state, completion count.
  app.get('/expedition', async (req: Request, res: Response) => {
    const parsed = parsePlayerId(req.query)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    try {
      res.json(await expeditionPayload(pool, parsed.playerId))
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // One dispel hit against a fragment's Echo Guardian. Requires a valid
  // player, today's route membership, and a not-yet-collected fragment.
  // Three hits clear the guardian; the server counts, never the client.
  app.post('/expedition/dispel', async (req: Request, res: Response) => {
    const parsed = parseExpeditionBody(req.body)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    const { playerId, fragmentId } = parsed
    try {
      const day = dayKeyFromDate(new Date())
      const route = fragmentsForDay(day)
      const slot = slotFor(route, fragmentId)
      if (slot < 0) {
        res.status(404).json({ error: 'not_in_today_mission' })
        return
      }
      const row = await getExpeditionRow(pool, parsed.playerId, day)
      if ((row.collected & (1 << slot)) !== 0) {
        res.status(409).json({ error: 'already_collected' })
        return
      }
      const hits = await addGuardianHit(pool, parsed.playerId, day, slot)
      res.json({ success: true, fragmentId, hits, cleared: hits >= EXPEDITION.guardianHits })
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // Collect a Memory Fragment: guardian must be cleared (3 hits), fragment
  // must be in today's route and not already collected.
  app.post('/expedition/collect', async (req: Request, res: Response) => {
    const parsed = parseExpeditionBody(req.body)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    const { playerId, fragmentId } = parsed
    try {
      const day = dayKeyFromDate(new Date())
      const route = fragmentsForDay(day)
      const slot = slotFor(route, fragmentId)
      if (slot < 0) {
        res.status(404).json({ error: 'not_in_today_mission' })
        return
      }
      const row = await getExpeditionRow(pool, parsed.playerId, day)
      if ((row.collected & (1 << slot)) !== 0) {
        res.status(409).json({ error: 'already_collected' })
        return
      }
      const hits = (row.guardianHits >> (slot * 2)) & 3
      if (hits < EXPEDITION.guardianHits) {
        res.status(403).json({ error: 'guardian_active' })
        return
      }
      const collected = await collectFragment(pool, parsed.playerId, day, slot)
      res.json({ success: true, fragmentId, collected })
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // Complete today's expedition: all three fragments collected. Returns
  // the updated completion count (social proof for everyone).
  app.post('/expedition/complete', async (req: Request, res: Response) => {
    const parsed = parsePlayerId(req.body)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    try {
      const day = dayKeyFromDate(new Date())
      const route = fragmentsForDay(day)
      const row = await getExpeditionRow(pool, parsed.playerId, day)
      const all = route.every((_, slot) => (row.collected & (1 << slot)) !== 0)
      if (!all) {
        res.status(403).json({ error: 'not_all_fragments_collected' })
        return
      }
      if (row.completedAt !== null) {
        res.status(409).json({ error: 'already_completed' })
        return
      }
      const todayCompletions = await completeExpedition(pool, parsed.playerId, day)
      res.json({ success: true, completed: true, todayCompletions })
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // --- Living World ---------------------------------------------------------

  // Location memories (G4): reactions left at expedition locations. Same
  // strictness as stone memories: whitelist reaction, one per player per
  // location, no extra fields.
  app.get('/locations/:locationId/memories', async (req: Request, res: Response) => {
    const locationId = req.params.locationId
    if (!isFragmentId(locationId)) {
      res.status(404).json({ error: 'unknown_location' })
      return
    }
    try {
      const memories = await getLocationMemories(pool, locationId)
      const count = await countLocationMemories(pool, locationId)
      res.json({ locationId, memories, memoryCount: count })
    } catch {
      res.status(500).json({ error: 'internal_error' })
    }
  })

  app.post('/locations/:locationId/memories', async (req: Request, res: Response) => {
    const locationId = req.params.locationId
    if (!isFragmentId(locationId)) {
      res.status(404).json({ error: 'unknown_location' })
      return
    }
    const raw = req.body as Record<string, unknown>
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      res.status(400).json({ error: 'body must be a JSON object' })
      return
    }
    const keys = Object.keys(raw)
    if (keys.length === 0) {
      res.status(400).json({ error: 'playerId and reaction are required' })
      return
    }
    if (keys.some((k) => k !== 'playerId' && k !== 'reaction')) {
      res.status(400).json({ error: 'unexpected fields are not allowed' })
      return
    }
    if (typeof raw.playerId !== 'string' || !PLAYER_ID_RE.test(raw.playerId)) {
      res.status(400).json({ error: 'playerId must be a valid 0x Ethereum address' })
      return
    }
    if (!isLocationReactionId(raw.reaction)) {
      res.status(400).json({ error: 'reaction must be one of: remembered, growing, beautiful, iwashere' })
      return
    }
    try {
      await insertLocationMemory(pool, locationId, raw.playerId.toLowerCase(), raw.reaction)
      const memories = await getLocationMemories(pool, locationId)
      const count = await countLocationMemories(pool, locationId)
      res.status(201).json({ success: true, locationId, reaction: raw.reaction, memoryCount: count, memories })
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        const existing = await getLocationMemory(pool, locationId, raw.playerId.toLowerCase())
        res.status(409).json({
          success: false,
          error: 'already_remembered',
          memory: existing
        })
        return
      }
      res.status(500).json({ error: 'internal_error' })
    }
  })

  // Rare memory discovery (G5): today's deterministic location, first
  // explorer wins. The server validates the location matches the day's
  // deterministic pick and that it is not already discovered.
  app.post('/world/discover', async (req: Request, res: Response) => {
    const parsed = parseExpeditionBody(req.body)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    try {
      const day = dayKeyFromDate(new Date())
      const rareLocation = rareLocationForDay(day, ALL_FRAGMENT_IDS)
      if (parsed.fragmentId !== rareLocation) {
        res.status(404).json({ error: 'not_todays_rare_memory' })
        return
      }
      const won = await discoverRareMemory(pool, day, rareLocation, parsed.playerId)
      if (!won) {
        res.status(409).json({ error: 'already_discovered' })
        return
      }
      res.json({ success: true, locationId: rareLocation, discovered: true })
    } catch {
      res.status(500).json({ error: 'internal_error' })
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
      const mission = await missionPayload(pool)
      res.status(201).json({
        success: true,
        stoneId,
        playerId,
        reaction,
        memoryCount: memories.length,
        memories,
        ...mission
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
