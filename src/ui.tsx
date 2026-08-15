// Mobile-first UI. Big touch target, short text, safe-area aware.
// The counter, stage chip and toasts all reflect server-confirmed state.
// The Memory Stone panel opens when a stone is tapped; its list, reaction
// picker and toasts are all driven by server-confirmed state.
import ReactEcs, { Button, Label, ReactEcsRenderer, ScreenInsetArea, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { STAGES } from './config'
import { contributionState, contributeToWorld, stageFor, worldState } from './state'
import { startPulse } from './tree'
import { closeStone, leaveMemoryOnStone, myMemoryOn, stoneState } from './stone-state'
import { reactionInfo } from './http-provider'
import { startStonePulse } from './stones'
import { REACTIONS, type ReactionId } from '../shared/stones'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const TOAST_MS = 2200
const ERROR_MS = 3200
const GOLD = Color4.fromHexString('#ffe08a')
const CREAM = Color4.fromHexString('#e8ddc8')
const PANEL = Color4.fromHexString('#14100ce6')
const PANEL_SOLID = Color4.fromHexString('#1c1712')
const RED = Color4.fromHexString('#ff9d8a')

// The pulse fires only after the server confirms the contribution.
function contribute() {
  void contributeToWorld().then((ok) => {
    if (ok) startPulse()
  })
}

// --- Memory Stone helpers --------------------------------------------------

// short display form of an eth address: 0x1234…abcd
export function shortId(playerId: string): string {
  if (playerId.length <= 12) return playerId
  return `${playerId.slice(0, 6)}…${playerId.slice(-4)}`
}

// "today" / "yesterday" / "Aug 14" style day labels from an ISO timestamp
export function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'someday'
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function leaveMemory(reaction: ReactionId) {
  void leaveMemoryOnStone(reaction).then((ok) => {
    if (ok) startStonePulse()
    // reset the picker after a confirmed save (or failed attempt)
    pickerOpen = false
  })
}

// two-stage flow: [LEAVE YOUR MEMORY] reveals the four reactions, the player
// picks one, the server confirms. Module-level because uiComponent re-renders.
let pickerOpen = false

// --- UI --------------------------------------------------------------------

const uiComponent = () => {
  const stage = stageFor(worldState.contributions)
  const stageName = STAGES.names[stage]
  const showToast = Date.now() - worldState.lastContributionAt < TOAST_MS
  const showError = Date.now() - contributionState.lastErrorAt < ERROR_MS
  const submitting = contributionState.status === 'submitting'

  const stoneOpen = stoneState.selected !== null
  const showStoneToast = Date.now() - stoneState.lastSavedAt < TOAST_MS
  const showStoneError = Date.now() - stoneState.lastErrorAt < ERROR_MS
  const saving = stoneState.saving
  const detail = stoneState.selected ? stoneState.details[stoneState.selected] : null
  const myMemory = stoneState.selected ? myMemoryOn(stoneState.selected) : null

  return (
    <ScreenInsetArea uiTransform={{ width: '100%', height: '100%' }}>
      {/* top: stage chip + counter (hidden while the stone UI is open) */}
      {!stoneOpen && (
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
      )}

      {/* bottom: the one-thumb action (tree button) */}
      {!stoneOpen && (
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
      )}

      {/* Memory Stone panel */}
      {stoneOpen && stoneState.selected && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: { left: 16, right: 16, top: 16, bottom: 16 }
          }}
        >
          <UiEntity
            uiTransform={{
              width: '100%',
              maxWidth: 420,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              padding: { top: 18, bottom: 18, left: 18, right: 18 }
            }}
            uiBackground={{ color: PANEL_SOLID }}
          >
            <UiEntity
              uiTransform={{ display: 'flex', flexDirection: 'row', alignItems: 'center', margin: { bottom: 4 } }}
            >
              <Label value="MEMORY STONE" fontSize={22} color={GOLD} textAlign="middle-left" />
              <UiEntity uiTransform={{ flexGrow: 1 }} />
              <Button
                value="✕"
                variant="secondary"
                fontSize={20}
                uiTransform={{ width: 44, height: 44 }}
                onMouseDown={() => closeStone()}
              />
            </UiEntity>
            <Label value="People who left a trace here" fontSize={13} color={CREAM} textAlign="middle-left" />
            <Label
              value={
                detail
                  ? `${detail.memoryCount} ${detail.memoryCount === 1 ? 'person remembers' : 'people remember'} this place.`
                  : '…'
              }
              fontSize={15}
              color={GOLD}
              textAlign="middle-left"
            />

            {/* history, newest first */}
            <UiEntity
              uiTransform={{
                display: 'flex',
                flexDirection: 'column',
                margin: { top: 10, bottom: 10 },
                padding: { top: 8, bottom: 8, left: 10, right: 10 }
              }}
              uiBackground={{ color: Color4.fromHexString('#00000055') }}
            >
              {detail && detail.memories.length === 0 && (
                <Label value="No memories yet. Be the first." fontSize={14} color={CREAM} textAlign="middle-center" />
              )}
              {detail &&
                detail.memories.slice(0, 5).map((m, i) => {
                  const info = reactionInfo(m.reaction)
                  return (
                    <Label
                      key={`${m.playerId}-${i}`}
                      value={`${info.emoji} ${shortId(m.playerId)} — ${dayLabel(m.createdAt)}`}
                      fontSize={15}
                      color={m.playerId === myMemory?.playerId ? GOLD : Color4.White()}
                      textAlign="middle-left"
                    />
                  )
                })}
              {detail && detail.memories.length > 5 && (
                <Label value={`+${detail.memories.length - 5} more`} fontSize={13} color={CREAM} textAlign="middle-left" />
              )}
            </UiEntity>

            {/* leave-your-memory / already-left */}
            {myMemory ? (
              <UiEntity
                uiTransform={{ padding: { top: 10, bottom: 10, left: 12, right: 12 } }}
                uiBackground={{ color: Color4.fromHexString('#2a2418f2') }}
              >
                <Label
                  value={`YOU ALREADY LEFT A MEMORY HERE ${reactionInfo(myMemory.reaction).emoji}`}
                  fontSize={14}
                  color={GOLD}
                  textAlign="middle-center"
                />
              </UiEntity>
            ) : pickerOpen ? (
              <UiEntity uiTransform={{ display: 'flex', flexDirection: 'column' }}>
                <Label value="What do you leave behind?" fontSize={14} color={CREAM} textAlign="middle-center" />
                <UiEntity
                  uiTransform={{
                    display: 'flex',
                    flexDirection: 'column',
                    margin: { top: 8 }
                  }}
                >
                  {REACTIONS.map((r) => (
                    <Button
                      key={r.id}
                      value={`${r.emoji} ${r.label}`}
                      variant="secondary"
                      fontSize={16}
                      uiTransform={{ width: '100%', height: 54, margin: { bottom: 6 } }}
                      onMouseDown={() => leaveMemory(r.id)}
                    />
                  ))}
                </UiEntity>
                <Button
                  value="CANCEL"
                  variant="secondary"
                  fontSize={14}
                  uiTransform={{ width: '100%', height: 40 }}
                  onMouseDown={() => (pickerOpen = false)}
                />
              </UiEntity>
            ) : (
              <Button
                value={saving ? 'SAVING...' : 'LEAVE YOUR MEMORY'}
                variant="primary"
                fontSize={18}
                uiTransform={{ width: '100%', height: 60 }}
                onMouseDown={() => (pickerOpen = true)}
              />
            )}

            {showStoneToast && (
              <UiEntity
                uiTransform={{ padding: { top: 8, bottom: 8, left: 16, right: 16 }, margin: { top: 8 } }}
                uiBackground={{ color: Color4.fromHexString('#2a2418f2') }}
              >
                <Label value="THE STONE REMEMBERS ✨" fontSize={16} color={GOLD} textAlign="middle-center" />
              </UiEntity>
            )}
            {showStoneError && (
              <UiEntity
                uiTransform={{ padding: { top: 8, bottom: 8, left: 16, right: 16 }, margin: { top: 8 } }}
                uiBackground={{ color: Color4.fromHexString('#2a1010f2') }}
              >
                <Label value="THE MEMORY COULDN'T BE SAVED. TRY AGAIN." fontSize={13} color={RED} textAlign="middle-center" />
              </UiEntity>
            )}
          </UiEntity>
        </UiEntity>
      )}
    </ScreenInsetArea>
  )
}
