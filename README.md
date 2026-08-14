# The World Remembers

A persistent social garden for the Decentraland Friendzone Mobile Buildathon.
Every tap helps the Memory Tree grow, and the world remembers.

## Milestone 1: Memory Tree vertical slice (Phase A)

Enter the scene, walk to the central tree, tap **HELP THE TREE GROW**.
The tree responds with a pulse, the counter rises, and the world slowly
warms from dusk toward golden day as the tree progresses:

| Stage | Contributions | Mood |
|---|---|---|
| DORMANT | 0–99 | Dusk, dim ember heart, 4 base flowers |
| AWAKENED | 100–249 | Sunset glow, 8 flowers, first motes |
| GROWING | 250–499 | Golden hour, 12 flowers, 6 motes |
| FLOURISHING | 500+ | Bright warm day, 16 flowers, 10 motes |

One Memory Tree model. Growth is visual state only: emissive heart, floating
motes, a bloom ring of daisies, a warm point light, and the skybox mood.
Thresholds and all visuals are configurable in `src/config.ts`.

Phase A uses a local mock state provider. Phase B/C add the persistence API.

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

## Known limits

- In-world visual verification needs the Decentraland client (desktop or
  mobile app). This VM has no GPU, so the Bevy web client (WebGPU) and the
  desktop explorer can't render headless here. Verification performed:
  build, typecheck, node smoke test against the real SDK engine, asset
  bounds, preview server serving.
- Phase A persistence is mock only. Phase B adds the Express + Postgres API,
  Phase C connects the scene to it.
