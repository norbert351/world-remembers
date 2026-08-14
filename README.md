# The World Remembers

A persistent social garden for the Decentraland Friendzone Mobile Buildathon.
Every tap helps the Memory Tree grow, and the world remembers.

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
  config.ts     world state config: thresholds, stages, colors, layout
  state.ts      contribution state + provider interface (mock in Phase A)
  tree.ts       Memory Tree, growth stages, pulse + mote systems
  garden.ts     ground, plaza, path, lanterns, props
  ui.tsx        mobile-first react-ecs UI
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
- `API.baseUrl` defaults to `http://127.0.0.1:3002` for local dev. The
  deployed world needs the production HTTPS URL there (or via build config).
  For phone testing, use the machine's LAN IP so the phone can reach the API.

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
| POST | `/contribute` | `{"playerId":"0x…40 hex…"}` | `200 {"success":true,"contributions":N,"stage":"…"}` | `400` invalid body/identity/extra fields, `413` too large, `500` db failure |

The client sends its DCL session identity (`getUserData().userId`, an eth
address). No wallet prompts, no signatures. `playerId` is required and
validated against `0x` + 40 hex; it is normalized to lowercase and is the
only accepted field. Clients can never submit a count: the server inserts
exactly one row per request and derives everything else.

### Stage thresholds

`shared/world-state.ts` is the single source of truth, imported by both the
scene (`src/config.ts`) and the API (`backend/src/app.ts`):
0-99 DORMANT, 100-249 AWAKENED, 250-499 GROWING, 500+ FLOURISHING.

### Deployment

Ready for Render: listens on `process.env.PORT`, uses `DATABASE_URL`,
handles SIGTERM, exposes `/health`. Nothing Render-specific in the code.

### Tests

`npm test` in `backend/` runs 11 integration tests against a real Postgres:
health, zero-state world, contribute, contribute-then-world, exact stage
boundaries (99/100/249/250/499/500), player id validation, invalid requests,
the count-injection attack, database failure isolation, CORS, multiple
contributions.
