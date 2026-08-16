// Scene init smoke test: run main() against the real @dcl/sdk ECS in node,
// then inspect what the scene actually created. Bundled with esbuild:
//   esbuild tests/scene-smoke.ts --bundle --platform=node --format=esm \
//     --alias:~system/Runtime=tests/runtime-stub.ts --outfile=/tmp/scene-smoke.mjs
import { engine, Transform, GltfContainer, MeshRenderer, TextShape } from '@dcl/sdk/ecs'
import { main } from '../src/index'
import { applyWorldState, stageFor, worldState } from '../src/state'
import { STONES } from '../src/config'
import { validateStoneConfig } from '../src/stones'

let failures = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (!cond) {
    failures++
    console.log(`FAIL ${name}`, extra ?? '')
  } else {
    console.log(`ok   ${name}`)
  }
}

main()

// count what got created
let gltfCount = 0
let meshCount = 0
let total = 0
let textCount = 0
for (const [entity] of engine.getEntitiesWith(Transform)) {
  total++
  if (GltfContainer.getOrNull(entity)) gltfCount++
  if (MeshRenderer.getOrNull(entity)) meshCount++
  if (TextShape.getOrNull(entity)) textCount++
}

// Phase C baseline was 59/32/25. Phase D added 3 stones x 9 entities
// (root + body + rune + ring + label + rig + 3 motes): 86/32/43/3.
// Phase E adds composition (2 zone discs + 3 path stones + 16 plaza border
// + 2 benches x 4 + 4 trail plants x 3 = 41) and tree hero extras
// (3 ground dots + 6 inner flowers = 9) + lighthouse foundation stage
// (7 parts): 144/38/88/3.
check('144 entities with transforms', total === 144, total)
check('38 gltf entities', gltfCount === 38, gltfCount)
check('88 mesh entities', meshCount === 88, meshCount)
check('3 text labels (one per stone)', textCount === 3, textCount)

// key placements from the design
const positions: string[] = []
for (const [_e, t] of engine.getEntitiesWith(Transform)) {
  positions.push(`${t.position.x.toFixed(1)},${t.position.y.toFixed(1)},${t.position.z.toFixed(1)}`)
}
check('ground at 16,-0.1,16', positions.includes('16.0,-0.1,16.0'))
check('plaza at 16,0,16', positions.includes('16.0,0.0,16.0'))
check('tree at 16,0.66,16', positions.includes('16.0,0.7,16.0'))
check('heart at 16,5,16', positions.includes('16.0,5.0,16.0'))

// every configured stone is placed and matches a shared stone id
check('stone config ids all valid', validateStoneConfig())
for (const s of STONES) {
  const key = `${s.position.x.toFixed(1)},${s.position.y.toFixed(1)},${s.position.z.toFixed(1)}`
  check(`stone ${s.id} placed at ${key}`, positions.includes(key), key)
}
// stones stay inside the 32x32 world and off the plaza center
for (const s of STONES) {
  const inBounds = s.position.x >= 0 && s.position.x <= 32 && s.position.z >= 0 && s.position.z <= 32
  check(`stone ${s.id} in bounds`, inBounds)
}

// Phase E composition placements
check('path extension stone at 8.2,8.2', positions.includes('8.2,0.0,8.2'))
check('path extension stone at 13.4,13.4', positions.includes('13.4,0.0,13.4'))
check('garden zone disc at 8,15', positions.includes('8.0,0.0,15.0'))
check('stone zone disc at 26,26', positions.includes('26.0,0.0,26.0'))
check('bench at 21.2,14.4', positions.includes('21.2,0.0,14.4'))
check('bench at 11.4,20.2', positions.includes('11.4,0.0,20.2'))

// state machine through the single apply path
applyWorldState(0)
check('dormant at 0 contributions', stageFor(worldState.contributions) === 0)
applyWorldState(520)
check('520 contributions -> flourishing', stageFor(worldState.contributions) === 3)
console.log(failures === 0 ? 'SMOKE TEST ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
