// Scene init smoke test: run main() against the real @dcl/sdk ECS in node,
// then inspect what the scene actually created. Bundled with esbuild:
//   esbuild tests/scene-smoke.ts --bundle --platform=node --format=esm \
//     --alias:~system/Runtime=tests/runtime-stub.ts --outfile=/tmp/scene-smoke.mjs
import { engine, Transform, GltfContainer, MeshRenderer } from '@dcl/sdk/ecs'
import { main } from '../src/index'
import { addContribution, stageFor, worldState } from '../src/state'
import { applyCurrentStage } from '../src/tree'

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
for (const [entity] of engine.getEntitiesWith(Transform)) {
  total++
  if (GltfContainer.getOrNull(entity)) gltfCount++
  if (MeshRenderer.getOrNull(entity)) meshCount++
}

check('59 entities with transforms', total === 59, total)
check('32 gltf entities', gltfCount === 32, gltfCount)
check('25 mesh entities', meshCount === 25, meshCount)

// key placements from the design
const positions: string[] = []
for (const [_e, t] of engine.getEntitiesWith(Transform)) {
  positions.push(`${t.position.x.toFixed(1)},${t.position.y.toFixed(1)},${t.position.z.toFixed(1)}`)
}
check('ground at 16,-0.1,16', positions.includes('16.0,-0.1,16.0'))
check('plaza at 16,0,16', positions.includes('16.0,0.0,16.0'))
check('tree at 16,0.66,16', positions.includes('16.0,0.7,16.0'))
check('heart at 16,5,16', positions.includes('16.0,5.0,16.0'))

// state machine
applyCurrentStage()
check('dormant stage applied at 0 contributions', stageFor(worldState.contributions) === 0)
for (let i = 0; i < 520; i++) addContribution()
check('520 contributions -> flourishing', stageFor(worldState.contributions) === 3)
applyCurrentStage()
console.log(failures === 0 ? 'SMOKE TEST ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
