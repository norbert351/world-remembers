// Mobile-first UI. Big touch target, short text, safe-area aware.
// The counter, stage chip and toasts all reflect server-confirmed state.
import ReactEcs, { Button, Label, ReactEcsRenderer, ScreenInsetArea, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { STAGES } from './config'
import { contributionState, contributeToWorld, stageFor, worldState } from './state'
import { startPulse } from './tree'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const TOAST_MS = 2200
const ERROR_MS = 3200
const GOLD = Color4.fromHexString('#ffe08a')
const CREAM = Color4.fromHexString('#e8ddc8')
const PANEL = Color4.fromHexString('#14100ce6')
const RED = Color4.fromHexString('#ff9d8a')

// The pulse fires only after the server confirms the contribution.
function contribute() {
  void contributeToWorld().then((ok) => {
    if (ok) startPulse()
  })
}

const uiComponent = () => {
  const stage = stageFor(worldState.contributions)
  const stageName = STAGES.names[stage]
  const showToast = Date.now() - worldState.lastContributionAt < TOAST_MS
  const showError = Date.now() - contributionState.lastErrorAt < ERROR_MS
  const submitting = contributionState.status === 'submitting'

  return (
    <ScreenInsetArea uiTransform={{ width: '100%', height: '100%' }}>
      {/* top: stage chip + counter */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0 },
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <UiEntity
          uiTransform={{ padding: { top: 8, bottom: 8, left: 22, right: 22 }, margin: { bottom: 4 } }}
          uiBackground={{ color: PANEL }}
        >
          <Label value={`${stageName} TREE`} fontSize={15} color={GOLD} textAlign="middle-center" />
        </UiEntity>
        <Label value={String(worldState.contributions)} fontSize={48} color={Color4.White()} textAlign="middle-center" />
        <Label value="MEMORY CONTRIBUTIONS" fontSize={12} color={CREAM} textAlign="middle-center" />
        {worldState.loadError && (
          <UiEntity
            uiTransform={{ padding: { top: 6, bottom: 6, left: 18, right: 18 }, margin: { top: 10 } }}
            uiBackground={{ color: Color4.fromHexString('#2a1010f2') }}
          >
            <Label value="THE WORLD IS OFFLINE. CONTRIBUTIONS CAN'T BE SAVED" fontSize={12} color={RED} textAlign="middle-center" />
          </UiEntity>
        )}
        {showToast && (
          <UiEntity
            uiTransform={{ padding: { top: 6, bottom: 6, left: 18, right: 18 }, margin: { top: 10 } }}
            uiBackground={{ color: Color4.fromHexString('#2a2418f2') }}
          >
            <Label value="THE TREE REMEMBERS ✨" fontSize={16} color={GOLD} textAlign="middle-center" />
          </UiEntity>
        )}
        {showError && (
          <UiEntity
            uiTransform={{ padding: { top: 6, bottom: 6, left: 18, right: 18 }, margin: { top: 10 } }}
            uiBackground={{ color: Color4.fromHexString('#2a1010f2') }}
          >
            <Label value="THE MEMORY COULDN'T BE SAVED. TRY AGAIN." fontSize={13} color={RED} textAlign="middle-center" />
          </UiEntity>
        )}
      </UiEntity>

      {/* bottom: the one-thumb action */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { bottom: 24 },
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center'
        }}
      >
        <Button
          value={submitting ? 'SAVING...' : 'HELP THE TREE GROW'}
          variant="primary"
          fontSize={22}
          uiTransform={{ width: 300, height: 76 }}
          onMouseDown={() => contribute()}
        />
      </UiEntity>
    </ScreenInsetArea>
  )
}
