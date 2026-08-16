# The World Remembers

A persistent social garden for the Decentraland Friendzone Mobile Buildathon.
Every tap helps the Memory Tree grow, and the world remembers who was here.

## Milestone 6: The Living Memory World (Phase F+G)

- **World Memory Level** — 5 derived levels from community activity
  (contributions + 5×stone memories + 25×completed expeditions).
  Level 1 THE SLEEPING WORLD → 5 THE REMEMBERED WORLD. Configurable
  thresholds in `shared/world-memory.ts`. Server-derived, never stored,
  never client-injectable.
- **Visible evolution** — level visuals applied to existing entities
  (flower rings, lantern glow, tree glow, motes, sky) in
  `src/world-evolution.ts`.
- **Memory Pulse** — the daily world event: tree pulse + light wave + sky
  shift. Triggered by server daily-event state, same for all players,
  works solo.
- **Memory Lighthouse** — one persistent primitive landmark on the east
  ridge, evolving FOUNDATION → TOWER → LANTERN → BEAM → BEACON as the
  community completes expeditions. `src/lighthouse.ts`.
- **"While You Were Gone"** — once-per-session panel with real server
  community data (garden, memories left, explorers, memory level).
- **Memory Trails** — collected expedition sites glow brighter as
  completions accumulate ("the location becomes richer").
- **Location memories** — leave one of 4 reactions at expedition sites
  (❤️ REMEMBERED 🌱 GROWING ✨ BEAUTIFUL 👋 I WAS HERE); one per player
  per location, whitelist + duplicate protection.
- **Rare Memory** — deterministic daily golden seed at one expedition
  location; first discoverer recorded; "🌟 RARE MEMORY DISCOVERED" state
  for the rest of the day. Server decides; client cannot fake it.

## Milestone 5: The Me...

The daily objective: **find the lost Memory Fragments, overcome the Echo
Guardians protecting them, and return the fragments to the Memory Tree.**

- **Deterministic daily route.** The day seed (`FNV-1a(date + worldId)`)
  picks 3 fragment spawn points from 10 predefined safe locations across
  three zones (garden, lighthouse side, memory area). The route changes
  every day, so the exploration route never repeats.
- **Echo Guardians.** Floating dark orb + emissive core + orbiting motes,
  all primitives. One-thumb interaction: the contextual `DISPEL` button
  appears within 5m; 3 server-confirmed hits dissolve the guardian and
  reveal the fragment. No aiming, no combat mechanics.
- **Memory Fragments.** Emissive crystal (crossed boxes + core + motes).
  Collecting is server-validated: the guardian must be cleared, the
  fragment must belong to today's route, duplicates are rejected.
- **The restoration.** When all 3 fragments are returned and the player
  taps the tree, the world responds: fragments fly to the tree, the tree
  pulses, a light wave travels outward, flowers bloom and the sky shifts.
  The bloom persists for everyone who loads after.
- **Social proof.** `GET /expedition` includes today's completion count;
  the card shows "N explorers today". Completion is per-player-per-day,
  one row in `expedition_progress`, so reloads and disconnects preserve
  progress and nothing can be client-injected.

API: `GET /expedition`, `POST /expedition/dispel`, `POST /expedition/collect`,
`POST /expedition/complete` — all server-authoritative.

## Milestone 4: Mission + contextual interaction (Phase E)

The world now answers "what am I supposed to do?" within seconds.

**TODAY'S MEMORY — RESTORE THE FORGOTTEN GARDEN.** A community mission:
100 distinct players (one per player, derived server-side from the union of
contributions and stone memories) restore the garden. Progress is
server-authoritative: `GET /mission`, and every `POST /contribute` and
stone-memory response carries the updated mission payload in the same
round trip. When progress hits the target the garden blooms: a daisy ring
and warm glow appear around the tree and persist across reloads.

**Contextual interaction.** The permanent "HELP THE TREE GROW" button is
gone. One CTA appears only when the player is near an interactive object:
`HELP THE TREE GROW` near the tree (6m radius), `LEAVE A MEMORY` near a
stone (4.5m). Priority: mission objective > tree > stone, nearest wins
within a priority. A 0.5s proximity tick drives it — never per-frame.
Mission panel is compact, collapsible to a `TODAY'S MEMORY 12/100` chip,
and shows the player's own confirmed participation.

## Milestone 3: World polish + Memory Moment (Phase E)

Three visual zones give the world one story: a warm Tree Plaza, a green
peaceful garden, and a darker mysterious stone area. The spawn path now
runs straight toward the tree (extended stepping stones, low benches at the
plaza edge, glowing trail plants that lead to the stones). The tree got
ground embers, an inner flower ring, and a small mote burst on every
server-confirmed contribution.

The **Memory Moment** is the world's automatic ritual. Every
`RITUAL.intervalSeconds` (dev: 5 minutes, production: one world day) the
world performs it alone:

1. **Quiet** — "THE WORLD IS REMEMBERING...", sky shifts to dusk (2s)
2. **Response** — tree glow rises, a light wave travels outward, the three
   stones pulse one after another (4s)
3. **Sky event** — a glowing comet crosses the sky, motes rise from the
   tree (4s)
4. **Complete** — "THE WORLD REMEMBERS." (2s)

The intensity comes from real state: 0 for an empty world, 1 once the tree
awakened or a stone has a memory, 2 when the tree is grown AND memories
exist. The ritual needs no other player, no server event, no input — it
simply happens. Onboarding shows three short lines on the first visit of a
session, then never again.

## Milestone 2: Memory Stones (Phase D)

Three stones placed around the garden record every visitor. Tap a stone to
read who left a trace before you, then leave one of four fixed reactions:

| Reaction | Meaning |
|---|---|
| 🌱 | I found this place. |
| ✨ | This place is beautiful. |
| 🌙 | I'll come back. |
| ❤️ | Someone was here. |

No free-form text: the server whitelists exactly these four reactions. One
memory per player per stone, enforced by a `UNIQUE(stone_id, player_id)`
constraint — a duplicate gets a 409 and the UI shows "YOU ALREADY LEFT A
MEMORY HERE" with the stored reaction. History is newest first, and the
stones show a floating billboard count ("7 MEMORIES") before you even open
them. Success effects (glow pulse, toast) fire only after the API confirms
the write.

Stones are primitive-built (dark smooth sphere, emissive rune, base glow
ring, 3 motes each), so no new GLB was needed and the mesh budget stays
tiny: 136 entities total (up from 59 in Phase C), 38 GLBs, 81 mesh
renderers, 3 text labels. Phase E additions are all primitives or reused
verified GLBs (daisy): zone discs, path stones, plaza border, benches,
trail plants, tree embers and inner flower ring.

## Milestone 1: Memory Tree vertical slice (Phase A)

Enter the scene, walk to the central tree, tap **HELP THE TREE GROW**.
The tree responds with a pulse, the counter rises, and the world slowly
warms from dusk toward golden day as the tree progresses:

| Stage | Contributions | Mood |
|---|---|---|
| DORMANT | 0-99 | Dusk, dim ember heart, 4 base flowers |
| AWAKENED | 100-249 | Sunset glow, 8 flowers, first motes |
| GROWING | 250-499 | Golden hour, 12 flowers, 6 motes |
| FLOURISHING | 500+ | Bright warm day, 16 flowers, 10 motes |

One Memory Tree model. Growth is visual state only: emissive heart, floating
motes, a bloom ring of daisies, a warm point light, and the skybox mood.
Thresholds and all visuals are configurable in `src/config.ts`.

Since Phase C the scene talks to the persistence API: world state loads from
`GET /world` on entry, every tap posts `POST /contribute` with the player's
DCL session identity, and only server-confirmed state mutates the scene.
The API URL lives in one place, `API.baseUrl` in `src/config.ts`.

## Commands

```bash
npm install
npm run build      # bundle + typecheck
npm test           # logic tests + scene smoke test (node, no explorer needed)
npm run start      # local preview (opens Decentraland client / bevy web)
```

## Structure

```
src/
  index.ts      entry, wires everything
  config.ts     world state config: thresholds, stages, colors, layout, stones
  state.ts      contribution state + provider interface (mock in Phase A)
  stone-state.ts  memory stone state + provider interface
  http-provider.ts  HTTP providers for world state + stones, response validation
  stones.ts     Memory Stones: entities, interaction, pulse + mote systems
  tree.ts       Memory Tree, growth stages, pulse + mote systems
  garden.ts     ground, plaza, path, lanterns, props
  ui.tsx        mobile-first react-ecs UI
shared/         stage thresholds + stone/reaction whitelist (scene + API)
assets/Models/  validated OpenDCL GLBs (see report below)
tests/          logic + smoke tests (node, no explorer required)
```

## Asset validation

All models from the OpenDCL catalog (free for Decentraland scenes, Apache-2.0
repo). Every GLB was checked with a node-transform-aware bounding box script,
collider detection, and animation listing before placement.

| Asset | Native bbox | Tris | Colliders | Anim | Used for |
|---|---|---|---|---|---|
| tree-memory.glb | 4.01×3.71×3.46 m | 768 | none | Tree_Action | hero tree (scale 2, y 0.66 → world bbox x[12.9,21.0] y[0,7.4] z[12.6,19.5]) |
| flower-daisy.glb | 0.36×0.84×0.39 m | 47 | none | none | bloom ring + garden flowers |
| bush-02.glb | 2.10×0.70×1.99 m | 68 | yes | none | garden bushes |
| bush-03.glb | 1.53×0.86×2.30 m | 57 | yes | none | garden bushes |
| fern.glb | 1.35×0.53×1.34 m | 80 | none | fernidle | path-side foliage |
| boulders.glb | 0.63×1.76×0.70 m | 62 | yes | All Animations (not played) | rocks |

Collision masks follow the official skill rules, never mixed:
models with `_collider` meshes use `invisibleMeshesCollisionMask: 3`,
models without use `visibleMeshesCollisionMask: 3` (interactive) or 0
(decorative).

## Scene structure (Phase C)

```
src/
  index.ts        entry, wires the HTTP provider and the state listener
  config.ts       world state config + API.baseUrl (one place)
  state.ts        provider interface, in-flight guard, applyWorldState
  http-provider.ts  GET /world + POST /contribute, response validation
  identity.ts     DCL session identity via getPlayer(), no wallet prompts
  tree.ts         Memory Tree, growth stages, pulse + mote systems
  garden.ts       ground, plaza, path, lanterns, props
  ui.tsx          mobile-first react-ecs UI, server-confirmed toasts
```

The contribution contract: tap -> POST -> server inserts one row -> returned
count applied through `applyWorldState` -> tree pulse and success toast fire
only after persistence. Duplicate taps during an in-flight request are
ignored. A failed request shows "The memory couldn't be saved. Try again."
and never touches the counter.

## Tests

```bash
npm test            # scene: logic + smoke + http provider (48 checks)
cd backend && npm test       # API integration against real postgres (11)
cd backend && npm run test:e2e  # full loop: provider -> API -> PG -> reload -> stages (7)
```

## Known limits

- In-world visual verification needs the Decentraland client (desktop or
  mobile app). This VM has no GPU, so the Bevy web client (WebGPU) and the
  desktop explorer can't render headless here. Verification performed:
  build, typecheck, node smoke test against the real SDK engine, asset
  bounds, and the persistence E2E through the real API + Postgres.
- `API.baseUrl` points at a Cloudflare quick tunnel while phone testing
  (the VM's LAN IP is unreachable from a phone, and the scene runtime has
  no `location` global to derive a host). Quick tunnel URLs rotate on
  restart: after restarting the API tunnel, update `API.baseUrl` in
  `src/config.ts` and rebuild. The deployed world needs the production
  HTTPS URL there.

---

## Backend (Phase B)

A tiny Express + PostgreSQL API. The database is the source of truth for
contributions. Tree stage is derived from the count, never stored.

### Layout

```
backend/
  src/index.ts        bootstrap, SIGTERM shutdown
  src/app.ts          express app, validation, error handling
  src/db.ts           pg pool + the two queries the API needs
  scripts/migrate.ts  applies migrations/*.sql
  migrations/         001_contributions.sql
  tests/api.test.ts   integration tests (node:test)
shared/world-state.ts  single source of truth for stage thresholds
```

### Local setup

```bash
# 1. create the database (adjust role/password to taste)
sudo -u postgres psql -c "CREATE ROLE worldremembers LOGIN PASSWORD '<pw>';"
sudo -u postgres psql -c "CREATE DATABASE world_remembers OWNER worldremembers;"

# 2. configure
cd backend
cp .env.example .env      # fill in DATABASE_URL, PORT, CORS_ORIGIN

# 3. install, migrate, run
npm install
npm run db:migrate        # idempotent, safe to re-run
npm run build
npm start                 # or npm run dev

# tests (uses a world_remembers_test database, created the same way)
sudo -u postgres psql -c "CREATE DATABASE world_remembers_test OWNER worldremembers;"
npm test
```

Environment variables:

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | (required) | postgres connection string |
| `PORT` | 3002 | HTTP port |
| `CORS_ORIGIN` | `*` | comma-separated origins, or `*` |

### API contract

| Method | Endpoint | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/health` | - | `200 {"status":"ok","db":"up"}` | `503 {"status":"degraded","db":"down"}` |
| GET | `/world` | - | `200 {"contributions":N,"stage":"AWAKENED"}` | `500 {"error":"internal_error"}` |
| POST | `/contribute` | `{"playerId":"0x…40 hex…"}` | `200 {"success":true,"contributions":N,"stage":"…","mission":{…}}` | `400` invalid body/identity/extra fields, `413` too large, `500` db failure |
| GET | `/mission` | - | `200 {"mission":{"id":"restore-forgotten-garden","title":"…","description":"…","progress":N,"target":100,"completed":bool}}` | `500 {"error":"internal_error"}` |
| GET | `/stones` | - | `200 {"stones":[{"id":"garden","memoryCount":N},…]}` | `500 {"error":"internal_error"}` |
| GET | `/stones/:id` | - | `200 {"stone":{"id":"garden","memoryCount":N},"memories":[{"playerId":"0x…","reaction":"found","createdAt":"…"}]}` (newest first) | `404 {"error":"unknown_stone"}`, `500` |
| POST | `/stones/:id/memories` | `{"playerId":"0x…40 hex…","reaction":"found"}` | `201 {"success":true,"stoneId":"garden","memoryCount":N,"memories":[…]}` | `400` invalid body/identity/reaction/extra fields, `404` unknown stone, `409 {"success":false,"error":"already_left_memory","memory":{…}}` duplicate, `413` too large, `500` db failure |
| GET | `/expedition?playerId=…` | - | `200 {"day":"2026-08-16","seed":N,"fragments":[{id,hits,collected}…],"completed":bool,"todayCompletions":N}` | `400` invalid identity, `500` |
| POST | `/expedition/dispel` | `{"playerId":"0x…","fragmentId":"g1"}` | `200 {"success":true,"hits":1..3,"cleared":bool}` | `400` invalid, `404` not in today's mission, `409` already collected, `500` |
| POST | `/expedition/collect` | `{"playerId":"0x…","fragmentId":"g1"}` | `200 {"success":true,"collected":N}` | `400` invalid, `403` guardian active, `404` not today, `409` already collected, `500` |
| POST | `/expedition/complete` | `{"playerId":"0x…"}` | `200 {"success":true,"completed":true,"todayCompletions":N}` | `403` not all collected, `409` already completed, `500` |

The client sends its DCL session identity (`getUserData().userId`, an eth
address). No wallet prompts, no signatures. `playerId` is required and
validated against `0x` + 40 hex; it is normalized to lowercase and is the
only accepted field on `/contribute`. Memory submissions accept exactly
`playerId` and `reaction`, and `reaction` must be on the whitelist shared
with the scene (`shared/stones.ts`). Clients can never submit a count: the
server inserts exactly one row per request and derives everything else.
One memory per player per stone (DB `UNIQUE` constraint), duplicates get a
409 carrying the stored memory.

### Stage thresholds

`shared/world-state.ts` is the single source of truth, imported by both the
scene (`src/config.ts`) and the API (`backend/src/app.ts`):
0-99 DORMANT, 100-249 AWAKENED, 250-499 GROWING, 500+ FLOURISHING.

### Deployment

Ready for Render: listens on `process.env.PORT`, uses `DATABASE_URL`,
handles SIGTERM, exposes `/health`. Nothing Render-specific in the code.

### Tests

`npm test` in `backend/` runs 25 integration tests against a real Postgres
(11 contribution tests + 14 stone tests): health, zero-state world,
contribute, contribute-then-world, exact stage boundaries (99/100/249/250/
499/500), player id validation, invalid requests, the count-injection
attack, database failure isolation, CORS, multiple contributions, stone
list/detail, valid memory creation, id normalization, invalid player ids,
invalid reactions, unknown stones, duplicate 409s, cross-stone freedom,
unexpected fields, oversized payloads, newest-first ordering, and DB
failure isolation for all three stone endpoints.

`npm run test:e2e` runs 13 end-to-end tests (7 contribution + 6 stone) that
spawn the real API against Postgres and drive the scene's actual HTTP
providers: Player A contributes/remembers, Player B sees it and adds their
own, both survive a reload, duplicates are rejected, and the list counts
match.

Scene tests (`npm test` at the root) run the logic, smoke, HTTP provider
and stone provider suites against node (no explorer needed), including the
stone provider suite: parsing, list/detail fetching, select/close,
in-flight guard, duplicate prevention client-side, 409 handling, failure
without optimistic mutation, and persistence across a simulated reload.
