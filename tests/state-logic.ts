// State logic tests: stage derivation and the contribution flow
import { STAGE_NAMES, STAGE_THRESHOLDS, stageFor, stageIndexFor } from '../shared/world-state'
import { addContribution, loadWorldState, worldState } from '../src/state'
import { STAGES } from '../src/config'

let failures = 0
function check(name: string, cond: boolean) {
  if (!cond) {
    failures++
    console.log(`FAIL ${name}`)
  } else {
    console.log(`ok   ${name}`)
  }
}

// stage boundaries (numeric index + name)
check('stage 0 at 0', stageIndexFor(0) === 0 && stageFor(0) === 'DORMANT')
check('stage 0 at 99', stageIndexFor(99) === 0 && stageFor(99) === 'DORMANT')
check('stage 1 at 100', stageIndexFor(100) === 1 && stageFor(100) === 'AWAKENED')
check('stage 1 at 249', stageIndexFor(249) === 1 && stageFor(249) === 'AWAKENED')
check('stage 2 at 250', stageIndexFor(250) === 2 && stageFor(250) === 'GROWING')
check('stage 2 at 499', stageIndexFor(499) === 2 && stageFor(499) === 'GROWING')
check('stage 3 at 500', stageIndexFor(500) === 3 && stageFor(500) === 'FLOURISHING')
check('stage 3 at 5000', stageIndexFor(5000) === 3 && stageFor(5000) === 'FLOURISHING')

// config sanity
check('thresholds ascending', STAGE_THRESHOLDS.every((v, i) => i === 0 || v > STAGE_THRESHOLDS[i - 1]))
check('4 stages', STAGE_NAMES.length === 4 && STAGES.names.length === 4)
check(
  'stage arrays aligned',
  STAGES.heartColor.length === 4 &&
    STAGES.heartIntensity.length === 4 &&
    STAGES.lightIntensity.length === 4 &&
    STAGES.skyTimes.length === 4 &&
    STAGES.flowersVisible.length === 4 &&
    STAGES.motesVisible.length === 4
)
check('skyTimes valid range', STAGES.skyTimes.every((t) => t >= 0 && t <= 86400))
check(
  'flowers/motes monotonic',
  STAGES.flowersVisible.every((v, i) => i === 0 || v > STAGES.flowersVisible[i - 1]) &&
    STAGES.motesVisible.every((v, i) => i === 0 || v >= STAGES.motesVisible[i - 1])
)

// contribution flow
worldState.contributions = 0
worldState.version = 0
addContribution()
check('contribution increments', worldState.contributions === 1)
check('version bumps', worldState.version === 1)
check('timestamp recorded', worldState.lastContributionAt > 0)

// mock provider round trip
await loadWorldState()
check('mock provider returns saved count', worldState.contributions === 1)

console.log(failures === 0 ? 'LOGIC TESTS ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
