# The World Remembers — Technical Reference

Precise description of the stack, the data model, the core algorithms and the
test suite, for "execution / craft" reviewers who want to know exactly how it
works and that it actually runs.

## Stack & dependencies

| Layer | Tech | Version (as installed) |
|---|---|---|
| Scene runtime | Decentraland SDK7 (`@dcl/sdk`) | 7.26.0 |
| Scene language | TypeScript, esbuild bundle (`@dcl/sdk-commands`) | — |
| Scene render | react-ecs `UiEntity` (mobile-first UI) | — |
| Backend | Express | 5 |
| Persistence | PostgreSQL (Neon, managed) via `pg` | 8.23 |
| CORS / JSON | `cors`, `express.json({ limit: '10kb' })` | — |
| Tests | Node built-in `node:test`, `esbuild` bundling | — |

## Directory layout

```
world-remembers/
  scene.json          World "worldremembers.dcl.eth", 12×12 parcels, permissions
  src/                SDK7 scene code (entities, systems, UI)
  shared/             Single source of truth, imported by BOTH scene and backend
  backend/
    src/app.ts        Express app factory (pool injected for tests)
    src/db.ts         pg pool + all queries
    scripts/migrate.ts
    migrations/*.sql  001–004
    tests/            integration + e2e
  tests/              scene logic + smoke tests (node, no GPU/explorer)
  scripts/            glb-validate, QR tooling, security-scan, verify-chain
```

## Data model

Four migrations. Everything a player does lands in a row; everything a
viewer reads is derived from those rows.

**`001_contributions`**
```
contributions(id BIGINT IDENTITY PK, player_id TEXT, created_at TIMESTAMPTZ)
```
One row per tap. Tree stage is **derived** from `COUNT(*)`, never stored.

**`002_memory_stones`** — a fixed set of stones (`garden`/`tree`/`ridge`) and:
```
stone_memories(id, stone_id FK, player_id, reaction, created_at,
               CONSTRAINT uq_stone_player UNIQUE(stone_id, player_id))
```
`reaction` is whitelist-validated server-side; the UNIQUE enforces one memory
per player per stone (duplicate → 409).

**`003_expedition`**
```
expedition_progress(player_id, day DATE, collected SMALLINT,
                    guardian_hits SMALLINT, completed_at TIMESTAMPTZ,
                    PRIMARY KEY(player_id, day))
```
One row per player per day. `collected` is a 3-bit mask (one bit per fragment
slot); `guardian_hits` packs 3 counters of 2 bits each (0..3 hits). Values are
bitmasks set only by the server, never the client.

**`004_living_world`**
```
location_memories(id, location_id, player_id, reaction, created_at,
                  UNIQUE(location_id, player_id))
rare_memory(day DATE PK, location_id, discovered_by, discovered_at)
```
Location reactions (G4) + the daily rare-memory first-discoverer record (G5).

## Core algorithms

### Daily deterministic expedition seed

The day's route is **never stored**. Every request recomputes it:

```
seed = FNV-1a(dayKey + ":" + worldId)        // dayKey = YYYY-MM-DD
realm = realmForDay(day)                     // one of 3 authored realms
fragments = realm.objectives (in journey order)
```

FNV-1a is deliberately non-cryptographic — it only needs to vary by day so the
route changes without a scheduler or a route table. `shared/expedition.ts` and
`shared/realms.ts` are the single source of truth, imported by backend and
scene.

### Guardian hit counters (bitfield, capped)

Hits are packed 2 bits per slot and **incremented with a guarded UPDATE**, not
OR:

```sql
SET guardian_hits = guardian_hits + (1 << (slot*2))
WHERE ((guardian_hits >> (slot*2)) & 3) < 3   -- cap at 3
RETURNING ((guardian_hits >> (slot*2)) & 3)
```

OR would stop incrementing at 1; without the guard 3→4 overflows into the next
slot. On zero rows returned the client falls back to a SELECT to read the cap.

### World Memory Level (derived)

```
score = contributions + 5·stoneMemories + 25·completedExpeditions
level  names: 1 THE SLEEPING WORLD → 5 THE REMEMBERED WORLD
```
Lighthouse stage is derived from `completedExpeditions`
(FOUNDATION→TOWER→LANTERN→BEAM→BEACON). None of this is stored.

### Mission anti-spam

Mission progress = `COUNT(DISTINCT player_id)` over
`(SELECT player_id FROM contributions UNION SELECT player_id FROM stone_memories)`.
One player = 1 point regardless of tap count; nothing client-injectable.

## API surface

Base `https://world-remembers-fz89.onrender.com`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | liveness + DB reachability (`{"status":"ok","db":"up"}`) |
| GET | `/world` | derived scene state (stage, level, landmark, daily event, rare) |
| POST | `/contribute` | one contribution, returns new stage + mission payload |
| GET | `/mission` | community mission progress |
| GET | `/expedition` | today's realm + route + this player's progress |
| POST | `/expedition/dispel` | one guardian hit (needs valid fragment, not collected) |
| POST | `/expedition/collect` | collect a cleared fragment |
| POST | `/expedition/complete` | finish when all 3 collected |
| GET | `/stones` | all stones + memory counts |
| GET | `/stones/:stoneId` | one stone + memory history (newest first) |
| POST | `/stones/:stoneId/memories` | leave a memory (whitelist + UNIQUE) |
| GET | `/locations/:locationId/memories` | location reactions |
| POST | `/locations/:locationId/memories` | leave a location reaction |
| POST | `/world/discover` | claim today's rare memory (first-wins) |

**Contract rules everywhere:**

- `playerId` = DCL session `0x` + 40 hex, lowercased, validated against
  `PLAYER_ID_RE`. Body objects accept **exactly** the documented fields — any
  extra field → 400.
- No client ever submits a count. Every mutation inserts one row and returns
  derived state.
- JSON body limit 10kb.

## Persistence isolation

The backend genuinely depends on **Neon Postgres** (not an in-memory mock):
`createPool` uses explicit `ssl: { rejectUnauthorized: false }` (pg 8.23
aliases `sslmode=require` to `verify-full`, which breaks secondary DBs), and
the app boot reads `DATABASE_URL` via `node --env-file=.env`. `db.ts` injects
a pool so tests can exercise a real DB and a broken one. The identity-sequence
desync bug (explicit-ID seeds leaving `GENERATED ALWAYS AS IDENTITY` behind) is
guarded by `setval('<table>_id_seq', MAX(id))` on seeding.

## Auth & security

- **Identity**: the DCL client exposes the session eth address via
  `getUserData().userId` — **no wallet prompts, no signatures**. This is the
  whole "social" trust model: an address is a persistent pseudonym.
- **Input**: strict field allowlists (extra keys rejected), whitelist-only
  reactions, identity regex, 10kb limit.
- **No secrets in the client**: `scripts/security-scan.sh` asserts no
  credentials ship in the bundle; QR tooling encodes only launch URLs, never
  the API/DB.
- **Integrity**: derived state is recomputed server-side; the client validates
  every payload with strict parsers (`expeditionFromServer` rejects
  wrong-realm fragments) before touching the scene.

## Tests & how to run

```bash
# Scene: logic + smoke + providers + mission/expedition/living-world/co-presence
npm test

# Backend: integration against a real Postgres (world_remembers_test)
cd backend && npm test

# Full loop through the scene's real HTTP provider → API → PG → reload
cd backend && npm run test:e2e
```

The scene tests run under plain **Node** (esbuild-bundled, with `~system/Runtime`
and `~system/RestrictedActions` stubs) — no GPU, no explorer. That is the
headless proof that scene logic is correct on a VM that cannot render.

## Deploy

- **World**: `worldremembers.dcl.eth` → `https://play.decentraland.org/?realm=worldremembers.dcl.eth`. Verified live: `/settings`
  returns `access_type: unrestricted`, `single_player: false`, `show_in_places:
  true`.
- **Backend**: Render service, `API.baseUrl = https://world-remembers-fz89.onrender.com`
  default in `src/config.ts` (overridable at build time via `API_BASE_URL`).
  `/health` live, `/world` returning real derived
  state (verified during the pre-submit audit).
- The deployed scene bundle cannot be diffed from a cloud VM; redeploying new
  scene code requires the owner's `DCL_PRIVATE_KEY` (user action).