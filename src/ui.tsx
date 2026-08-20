// Mobile-first UI. Big touch target, short text, safe-area aware.
// The counter, stage chip and toasts all reflect server-confirmed state.
// The Memory Stone panel opens when a stone is tapped; its list, reaction
// picker and toasts are all driven by server-confirmed state.
import ReactEcs, { Button, Label, ReactEcsRenderer, ScreenInsetArea, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { STAGES, TREE } from './config'
import { contributionState, contributeToWorld, stageFor, worldState } from './state'
import { startPulse } from './tree'
import { closeStone, leaveMemoryOnStone, myMemoryOn, selectStone, stoneState } from './stone-state'
import { reactionInfo } from './http-provider'
import { startStonePulse } from './stones'
import { REACTIONS, type ReactionId } from '../shared/stones'
import { currentOnboardingLine } from './onboarding'
import { ritualState } from './ritual'
import { interactionState } from './interaction'
import { missionCompleted, missionProgress, missionState, missionTarget, playerHasParticipated } from './mission'
import { playerStoneMemoryIds } from './stone-state'
import {
  collectFragment as collectExpeditionFragment,
  completeExpedition,
  dispelCurrentObjective,
  dispelGuardian,
  dispelInFlightNow,
  expeditionCollectedCount,
  expeditionCompleted,
  expeditionFragments,
  expeditionState,
  expeditionTodayCompletions
} from './expedition'
import { fragmentLocation, zoneOf, type ExpeditionFragmentId } from '../shared/expedition'
import { enterRealm, returnToHub } from './realm-portal'
import { realmById, objectiveById } from '../shared/realms'
import { describeNextTarget, navApproach } from './navigation'
import { describeMissionCard, guardianHitMessage, NEAR_RADIUS } from './mission-clarity'
import { startRestoration } from './restoration'
import {
  livingCommunityActivity,
  livingMemoryLevel,
  livingMemoryLevelName,
  livingRareDiscovered,
  livingRareLocation,
  livingWorldState
} from './living-world'
import { LOCATION_REACTIONS, type LocationReactionId } from '../shared/world-memory'
import { trailSegment } from './trail-core'

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
// the community (100-player) mission is secondary; collapsed to a compact
// chip by default so the Expedition reads as the one clear objective
let missionPanelCollapsed = true
// expedition card starts open once loaded; collapses to a chip
let expeditionPanelCollapsed = false
let journalOpen = false
// fires the restoration ritual exactly once per completion
let restorationTriggered = false
let lastSeenCompleted = false
// "While You Were Gone" — once per session, dismissible
let returnPanelDismissed = false
let returnPanelSeen = false
// how far into today's mission the player has gone (client acknowledgment
// only; all real progress is server-authoritative). START reveals the
// trail and focuses the objective.
let startedExpedition = false
// guardian per-hit feedback toast + per-fragment last-shown hit tracking
let guardianToastUntil = 0
let guardianToastText = ''
const lastShownHitsByFragment: Record<string, number> = {}
// arrival feedback: a short, non-blocking "MEMORY BEACON FOUND" toast, fired
// once per objective when the player first gets within NEAR_RADIUS (triggered
// by proximity, not camera)
let arrivalToastUntil = 0
let arrivalToastText = ''
const arrivalAnnounced: Record<string, boolean> = {}
// dispel failure feedback
let dispelErrorToastUntil = 0
let dispelErrorShown = false
let dispelErrorToastText = 'THE MEMORY COULDN\u2019T BE DISPELLED \u00B7 TRY AGAIN'
// brief success banner after a live restoration + when the world level
// actually ticks up (never faked — only when the real level changes)
let restorationBannerUntil = 0
let levelToastUntil = 0
let lastLevelSeen = -1
let levelToastValue = 0
// a player who just restored is nudged (optionally) to leave a trace
let leaveTraceHintUntil = 0
// subtle, dismissible rare-memory discovery nudge (P2)
let rareHintDismissed = false

// the player's own participation summary for the mission panel
function playerContributedText(): string {
  const stones = playerStoneMemoryIds()
  const parts: string[] = []
  if (stones.length > 0) parts.push(`remembered at stone${stones.length > 1 ? 's' : ''} ${stones.join(', ')}`)
  return parts.length > 0 ? parts.join(' · ') : 'the world felt your tap'
}

// today's realm from the server's expedition state
function todayRealm() {
  const id = expeditionState.state?.realm.id
  return id ? realmById(id) : undefined
}

// bring the player home, then complete + restore (payoff plays at the tree)
function restoreAndReturn(): void {
  void (async () => {
    await returnToHub()
    await completeExpedition()
  })()
}

// guidance line that points the player at the next objective along the
// navigational trail (pure trail-core math, rendered as text)
function nextObjectiveText(): string {
  const seg = trailSegment(expeditionFragments(), { x: TREE.position.x, z: TREE.position.z })
  if (seg === null) return 'Find the lost memories.'
  if (seg.allCollected) return 'All memories found. Follow the trail home to restore them.'
  const zone = seg.next ? zoneOf(seg.next.id as ExpeditionFragmentId) : 'the garden'
  return `Follow the trail — a memory waits in ${zone}.`
}

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

  // ritual banner: the world remembers, all by itself
  const ritualPhase = ritualState.phase
  const ritualText =
    ritualPhase === 'quiet'
      ? 'THE WORLD IS REMEMBERING...'
      : ritualPhase === 'complete'
        ? 'THE WORLD REMEMBERS.'
        : null

  // onboarding: first-visit lines, once per session
  const onboardingLine = currentOnboardingLine()

  // restoration: when the server confirms completion, fly the fragments in
  // and let the world respond — once. A live (or resumed) completion shows a
  // short success banner and a nudge to leave a trace for the next explorer.
  const completedNow = expeditionState.state?.completed ?? false

  // live navigation readout (distance to the next objective / shrine)
  const nav = describeNextTarget(interactionState.player)
  // contextual, phase-aware mission card (WHAT -> WHERE -> HOW FAR -> DO)
  const card = describeMissionCard(interactionState.player, startedExpedition)
  // the canonical DISPEL is in flight (exactly one request per tap)
  const ctaGuardianInFlight = interactionState.target?.type === 'guardian' && dispelInFlightNow()
  // guardian per-hit feedback: when the server confirms a rise in hits, show
  // the matching "GUARDIAN WEAKENED / ALMOST FREE" toast (the freed + found
  // moment is covered by the existing collection toast)
  for (const f of expeditionFragments()) {
    const prev = lastShownHitsByFragment[f.id] ?? 0
    if (f.hits > prev && f.hits >= 1 && f.hits < 3) {
      guardianToastText = guardianHitMessage(f.hits)
      guardianToastUntil = Date.now() + TOAST_MS
    }
    if (f.hits !== prev) lastShownHitsByFragment[f.id] = f.hits
  }
  // arrival: once per objective, when the player is close (proximity, not
  // camera). Clear, short, non-blocking.
  const nextFrag = expeditionFragments().find((f) => !f.collected)
  if (
    nextFrag &&
    card.phase !== 'enter' &&
    card.phase !== 'loading' &&
    card.howFar !== null &&
    card.howFar <= NEAR_RADIUS &&
    !arrivalAnnounced[nextFrag.id]
  ) {
    arrivalAnnounced[nextFrag.id] = true
    arrivalToastText =
      card.phase === 'guardian' ? 'MEMORY BEACON FOUND · a guardian protects the memory' : 'MEMORY BEACON FOUND · the memory is nearby'
    arrivalToastUntil = Date.now() + 3200
  }
  // dispel failure: surface once per failed attempt (timeout vs network)
  if (expeditionState.dispelError && !dispelErrorShown) {
    dispelErrorShown = true
    dispelErrorToastUntil = Date.now() + ERROR_MS
    dispelErrorToastText =
      expeditionState.lastDispelError === 'timeout'
        ? 'DISPEL FAILED \u00B7 COULD NOT BE REACHED \u00B7 TRY AGAIN'
        : 'DISPEL FAILED \u00B7 CHECK YOUR CONNECTION \u00B7 TRY AGAIN'
  } else if (!expeditionState.dispelError) {
    dispelErrorShown = false
  }
  if (completedNow && !lastSeenCompleted) {
    lastSeenCompleted = true
    restorationBannerUntil = Date.now() + 5000
    leaveTraceHintUntil = Date.now() + 9000
    if (!restorationTriggered) {
      restorationTriggered = true
      const positions = expeditionFragments().map((f) => fragmentLocation(f.id)).filter((p): p is { x: number; z: number } => !!p)
      startRestoration(positions)
    }
  }

  // world memory level: surface an honest toast ONLY when the real level
  // rises this session (server-derived). Never fakes progression.
  const curLevel = livingMemoryLevel()
  if (lastLevelSeen === -1) {
    lastLevelSeen = curLevel
  } else if (curLevel > lastLevelSeen && lastLevelSeen >= 1) {
    levelToastUntil = Date.now() + 5000
    levelToastValue = curLevel
  }
  lastLevelSeen = curLevel

  // "While You Were Gone": once per session, after the living world loads,
  // only when there is real community activity to report
  const lw = livingWorldState.state
  const hasCommunityLife =
    lw !== null && (lw.communityActivity.contributions > 0 || lw.communityActivity.stoneMemories > 0 || lw.communityActivity.completedExpeditions > 0)
  const showReturnPanel = lw !== null && hasCommunityLife && !returnPanelDismissed && !returnPanelSeen
  if (showReturnPanel) returnPanelSeen = true

  return (
    <ScreenInsetArea uiTransform={{ width: '100%', height: '100%' }}>
      {/* "While You Were Gone" — real server data, dismissible, once */}
      {showReturnPanel && !stoneOpen && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: { left: 24, right: 24 }
          }}
        >
          <UiEntity
            uiTransform={{
              width: '100%',
              maxWidth: 380,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              padding: { top: 18, bottom: 18, left: 18, right: 18 }
            }}
            uiBackground={{ color: PANEL_SOLID }}
          >
            <Label value="WHILE YOU WERE GONE" fontSize={18} color={GOLD} textAlign="middle-center" />
            <Label value={`🌱 The garden grew.`} fontSize={14} color={CREAM} textAlign="middle-left" uiTransform={{ margin: { top: 10 } }} />
            <Label
              value={`🗿 ${lw!.communityActivity.stoneMemories} new ${lw!.communityActivity.stoneMemories === 1 ? 'memory' : 'memories'} left.`}
              fontSize={14}
              color={CREAM}
              textAlign="middle-left"
            />
            <Label
              value={`✨ ${lw!.communityActivity.completedExpeditions} ${lw!.communityActivity.completedExpeditions === 1 ? 'explorer' : 'explorers'} restored memories.`}
              fontSize={14}
              color={CREAM}
              textAlign="middle-left"
            />
            <Label value={`🌍 ${expeditionTodayCompletions()} completed today's memory.`} fontSize={14} color={CREAM} textAlign="middle-left" />
            <Label value={`🔥 The world reached Memory Level ${livingMemoryLevel()}: ${livingMemoryLevelName()}.`} fontSize={14} color={GOLD} textAlign="middle-left" />
            <Label value={`TODAY'S MEMORY IS READY`} fontSize={16} color={GOLD} textAlign="middle-center" uiTransform={{ margin: { top: 8 } }} />
            <Button
              value="BEGIN EXPEDITION"
              variant="primary"
              fontSize={18}
              uiTransform={{ width: '100%', height: 56, margin: { top: 12 } }}
              onMouseDown={() => {
                startedExpedition = true
                returnPanelDismissed = true
              }}
            />
          </UiEntity>
        </UiEntity>
      )}

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
          <Label
            value={`🌍 ${expeditionTodayCompletions()} explorers · ${livingCommunityActivity().completedExpeditions} restored today`}
            fontSize={12}
            color={Color4.fromHexString('#9fd8ff')}
            textAlign="middle-center"
            uiTransform={{ margin: { top: 2 } }}
          />
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

      {/* success / reward / world-consequence banners: restoration payoff,
          honest level-up toast, rare-discovery nudge, leave-a-trace hint.
          All kept small, centered, and non-blocking. */}
      {!stoneOpen && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 230 },
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          {Date.now() < restorationBannerUntil && (
            <UiEntity
              uiTransform={{ padding: { top: 12, bottom: 12, left: 30, right: 30 } }}
              uiBackground={{ color: Color4.fromHexString('#1c2a18f2') }}
            >
              <Label value="MEMORY RESTORED ✨" fontSize={22} color={GOLD} textAlign="middle-center" />
            </UiEntity>
          )}
          {Date.now() < levelToastUntil && (
            <UiEntity
              uiTransform={{ padding: { top: 10, bottom: 10, left: 26, right: 26 } }}
              uiBackground={{ color: PANEL }}
            >
              <Label
                value={`The world reached Memory Level ${levelToastValue}: ${livingMemoryLevelName()}`}
                fontSize={15}
                color={Color4.fromHexString('#9fd8ff')}
                textAlign="middle-center"
              />
            </UiEntity>
          )}
          {Date.now() - expeditionState.lastCollectAt < TOAST_MS && (() => {
            const flavor = expeditionState.lastCollectFragment ? objectiveById(expeditionState.lastCollectFragment)?.flavor : undefined
            return (
              <UiEntity
                uiTransform={{ padding: { top: 10, bottom: 10, left: 24, right: 24 } }}
                uiBackground={{ color: Color4.fromHexString('#1c2a30f2') }}
              >
                <Label
                  value={`MEMORY FOUND${flavor ? ` — ${flavor}` : ''}`}
                  fontSize={15}
                  color={Color4.fromHexString('#9fd8ff')}
                  textAlign="middle-center"
                />
              </UiEntity>
            )
          })()}
          {Date.now() < arrivalToastUntil && (
            <UiEntity
              uiTransform={{ padding: { top: 12, bottom: 12, left: 28, right: 28 } }}
              uiBackground={{ color: Color4.fromHexString('#1c2a30f2') }}
            >
              <Label value={arrivalToastText} fontSize={18} color={Color4.fromHexString('#9fd8ff')} textAlign="middle-center" />
            </UiEntity>
          )}
          {Date.now() < dispelErrorToastUntil && (
            <UiEntity
              uiTransform={{ padding: { top: 10, bottom: 10, left: 24, right: 24 } }}
              uiBackground={{ color: Color4.fromHexString('#2a1010f2') }}
            >
              <Label value={dispelErrorToastText} fontSize={14} color={RED} textAlign="middle-center" />
            </UiEntity>
          )}
          {!rareHintDismissed && livingRareLocation() !== null && !livingRareDiscovered() && (
            <UiEntity
              uiTransform={{ padding: { top: 8, bottom: 8, left: 20, right: 20 } }}
              uiBackground={{ color: Color4.fromHexString('#2a2418f2') }}
            >
              <Label
                value="✨ A strange golden memory has appeared somewhere. Search the world."
                fontSize={12}
                color={GOLD}
                textAlign="middle-center"
              />
            </UiEntity>
          )}
          {Date.now() < leaveTraceHintUntil && (
            <UiEntity
              uiTransform={{ padding: { top: 8, bottom: 8, left: 20, right: 20 } }}
              uiBackground={{ color: Color4.fromHexString('#2a2418f2') }}
            >
              <Label value="Leave a memory on a Memory Stone for the next explorer." fontSize={12} color={CREAM} textAlign="middle-center" />
            </UiEntity>
          )}
        </UiEntity>
      )}

      {/* bottom: contextual interaction CTA — one at a time, only when the
          player is near an interactive object. No permanent button. */}
      {!stoneOpen && interactionState.target && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: 24 },
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <Button
            value={ctaGuardianInFlight ? 'DISPELLING...' : submitting ? 'SAVING...' : interactionState.target.label}
            variant="primary"
            fontSize={22}
            uiTransform={{ width: 300, height: 76 }}
            onMouseDown={() => {
              const t = interactionState.target
              if (!t) return
              if (t.type === 'portal') {
                const r = todayRealm()
                if (r) {
                  startedExpedition = true
                  void enterRealm(r)
                }
              } else if (t.type === 'stone') {
                selectStone(t.id)
              } else if (t.type === 'guardian') {
                // single canonical dispel — same one the world tap uses
                void dispelGuardian(t.id as ExpeditionFragmentId)
              } else if (t.type === 'fragment') {
                void collectExpeditionFragment(t.id as ExpeditionFragmentId)
              } else if (t.type === 'tree' && expeditionCollectedCount() === 3 && !expeditionCompleted() && !restorationTriggered) {
                // all memories returned: restore the world
                void completeExpedition()
              } else {
                contribute()
              }
            }}
          />
          <Label
            value={interactionState.target.hint}
            fontSize={13}
            color={CREAM}
            textAlign="middle-center"
            uiTransform={{ margin: { top: 4 } }}
          />
        </UiEntity>
      )}

      {/* Expedition card: the daily objective. Shows after it loads,
          collapsible like the mission card. */}
      {!stoneOpen && expeditionState.state && !expeditionPanelCollapsed && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 96 },
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 320,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              padding: { top: 10, bottom: 10, left: 14, right: 14 }
            }}
            uiBackground={{ color: PANEL }}
          >
            <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
              <Label value="TODAY'S MEMORY" fontSize={13} color={GOLD} textAlign="middle-left" />
              <UiEntity uiTransform={{ flexGrow: 1 }} />
              <Button
                value="−"
                variant="secondary"
                fontSize={16}
                uiTransform={{ width: 36, height: 36 }}
                onMouseDown={() => (expeditionPanelCollapsed = true)}
              />
            </UiEntity>
            {/* phase-aware card: WHAT -> WHERE -> HOW FAR -> WHAT TO DO */}
            <Label value={card.title} fontSize={18} color={Color4.White()} textAlign="middle-left" />
            <Label
              value={card.objective}
              fontSize={12}
              color={CREAM}
              textAlign="middle-left"
              textWrap="wrap"
              uiTransform={{ margin: { top: 2 } }}
            />
            {/* progress: big, obvious */}
            <Label value={card.progress} fontSize={28} color={GOLD} textAlign="middle-left" uiTransform={{ margin: { top: 4 } }} />
            {/* WHERE + HOW FAR */}
            {card.nextWhere && card.howFar !== null && (
              <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', alignItems: 'center', margin: { top: 2 } }}>
                <Label value="NEXT MEMORY" fontSize={11} color={CREAM} textAlign="middle-left" />
                <Label value={`  ${card.nextWhere} · ${card.distanceLabel}`} fontSize={16} color={Color4.fromHexString('#9fd8ff')} textAlign="middle-left" />
              </UiEntity>
            )}
            {/* direction (closer / away), low-frequency */}
            {card.direction !== 'steady' && card.phase !== 'guardian' && card.phase !== 'near' && (
              <Label
                value={card.direction === 'closer' ? '✓ GETTING CLOSER' : "⚠️ YOU'RE MOVING AWAY"}
                fontSize={12}
                color={card.direction === 'closer' ? Color4.fromHexString('#8fe3c0') : Color4.fromHexString('#ff9d8a')}
                textAlign="middle-left"
                uiTransform={{ margin: { top: 2 } }}
              />
            )}
            {/* first-time hint */}
            {card.hint && <Label value={card.hint} fontSize={12} color={CREAM} textAlign="middle-left" textWrap="wrap" uiTransform={{ margin: { top: 2 } }} />}
            {/* WHAT TO DO */}
            {card.action && (
              <Label value={card.action} fontSize={16} color={GOLD} textAlign="middle-left" textWrap="wrap" uiTransform={{ margin: { top: 6 } }} />
            )}
            {/* guardian hit feedback */}
            {Date.now() < guardianToastUntil && (
              <Label value={guardianToastText} fontSize={15} color={Color4.fromHexString('#ffc46b')} textAlign="middle-left" uiTransform={{ margin: { top: 6 } }} />
            )}
            {/* contextual primary action */}
            {card.phase === 'enter' && (
              <Button
                value="ENTER THE REALM"
                variant="primary"
                fontSize={18}
                uiTransform={{ width: '100%', height: 56, margin: { top: 10 } }}
                onMouseDown={() => {
                  startedExpedition = true
                  const r = todayRealm()
                  if (r) void enterRealm(r)
                }}
              />
            )}
            {card.phase === 'return' && (
              <Button
                value="RESTORE TODAY'S MEMORY"
                variant="primary"
                fontSize={17}
                uiTransform={{ width: '100%', height: 56, margin: { top: 10 } }}
                onMouseDown={restoreAndReturn}
              />
            )}
            {card.phase === 'guardian' && (() => {
              const g = expeditionFragments().find((f) => !f.collected)
              const hits = g ? (expeditionState.state?.fragments.find((x) => x.id === g.id)?.hits ?? 0) : 0
              const dots = '●'.repeat(Math.min(hits, 3)) + '○'.repeat(Math.max(0, 3 - hits))
              return (
                <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', alignItems: 'center', margin: { top: 8 } }}>
                  <Label value={`DISPEL  ${hits} / 3`} fontSize={20} color={Color4.White()} textAlign="middle-left" />
                  <Label value={`  ${dots}`} fontSize={20} color={GOLD} textAlign="middle-left" uiTransform={{ margin: { left: 8 } }} />
                </UiEntity>
              )
            })()}
          </UiEntity>
        </UiEntity>
      )}

      {/* collapsed expedition chip */}
      {!stoneOpen && expeditionState.state && expeditionPanelCollapsed && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 96 },
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center'
          }}
        >
          <Button
            value={`EXPEDITION  ${'●'.repeat(expeditionCollectedCount())}${'○'.repeat(3 - expeditionCollectedCount())}  ${expeditionCollectedCount()}/3`}
            variant="secondary"
            fontSize={15}
            uiTransform={{ width: 260, height: 44 }}
            onMouseDown={() => (expeditionPanelCollapsed = false)}
          />
        </UiEntity>
      )}

      {/* Memory Journal: lightweight progression + retention. All rows are
          server-derived (never invented). Toggled from a small top-right pill. */}
      {!stoneOpen && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 96, right: 16 },
            display: 'flex'
          }}
        >
          <Button
            value={journalOpen ? 'CLOSE' : 'JOURNAL'}
            variant="secondary"
            fontSize={13}
            uiTransform={{ width: 104, height: 40 }}
            onMouseDown={() => (journalOpen = !journalOpen)}
          />
        </UiEntity>
      )}
      {!stoneOpen && journalOpen && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 150 },
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 320,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              padding: { top: 12, bottom: 12, left: 14, right: 14 }
            }}
            uiBackground={{ color: PANEL }}
          >
            <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
              <Label value="MEMORY JOURNAL" fontSize={14} color={GOLD} textAlign="middle-left" />
              <UiEntity uiTransform={{ flexGrow: 1 }} />
              <Button
                value="−"
                variant="secondary"
                fontSize={16}
                uiTransform={{ width: 36, height: 36 }}
                onMouseDown={() => (journalOpen = false)}
              />
            </UiEntity>

            <Label value="TODAY" fontSize={12} color={GOLD} textAlign="middle-left" uiTransform={{ margin: { top: 10 } }} />
            <Label
              value={`${todayRealm()?.name ?? 'The Garden'}`}
              fontSize={12}
              color={Color4.fromHexString('#9fd8ff')}
              textAlign="middle-left"
              uiTransform={{ margin: { top: 2, bottom: 4 } }}
            />
            {expeditionFragments().map((f, i) => (
              <Label
                key={f.id}
                value={f.collected ? '✓  Memory found' : `○  Memory ${i + 1} of 3`}
                fontSize={13}
                color={f.collected ? GOLD : CREAM}
                textAlign="middle-left"
                uiTransform={{ margin: { top: 3 } }}
              />
            ))}
            <Label
              value={expeditionCompleted() ? '✓  Memory restored' : '○  Restoration'}
              fontSize={13}
              color={expeditionCompleted() ? GOLD : CREAM}
              textAlign="middle-left"
              uiTransform={{ margin: { top: 3 } }}
            />

            <Label value="WORLD" fontSize={12} color={GOLD} textAlign="middle-left" uiTransform={{ margin: { top: 12 } }} />
            <Label
              value={`Memory Level ${livingMemoryLevel()} · ${livingMemoryLevelName()}`}
              fontSize={13}
              color={Color4.fromHexString('#9fd8ff')}
              textAlign="middle-left"
              uiTransform={{ margin: { top: 2 } }}
            />
            <Label
              value={`${livingCommunityActivity()?.completedExpeditions ?? 0} memories restored by explorers today`}
              fontSize={12}
              color={CREAM}
              textAlign="middle-left"
              uiTransform={{ margin: { top: 2 } }}
            />
            {livingRareLocation() !== null && (
              <Label
                value={livingRareDiscovered() ? 'RARE MEMORY · FOUND ✨' : 'RARE MEMORY · NOT YET FOUND'}
                fontSize={13}
                color={livingRareDiscovered() ? GOLD : Color4.fromHexString('#9fd8ff')}
                textAlign="middle-left"
                uiTransform={{ margin: { top: 2 } }}
              />
            )}
          </UiEntity>
        </UiEntity>
      )}

      {/* Mission panel: compact, collapsible, anchored under the counter so
          the bottom of the screen stays free for the contextual CTA. */}
      {!stoneOpen && missionState.mission && !missionPanelCollapsed && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 150 },
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              width: 320,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              padding: { top: 12, bottom: 12, left: 14, right: 14 }
            }}
            uiBackground={{ color: PANEL }}
          >
            <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
              <Label value="COMMUNITY TREE" fontSize={13} color={GOLD} textAlign="middle-left" />
              <UiEntity uiTransform={{ flexGrow: 1 }} />
              <Button
                value="−"
                variant="secondary"
                fontSize={16}
                uiTransform={{ width: 36, height: 36 }}
                onMouseDown={() => (missionPanelCollapsed = true)}
              />
            </UiEntity>
            <Label
              value={missionCompleted() ? 'THE FORGOTTEN GARDEN HAS BEEN RESTORED.' : missionState.mission.title}
              fontSize={16}
              color={Color4.White()}
              textAlign="middle-left"
            />
            {!missionCompleted() && (
              <Label value={missionState.mission.description} fontSize={11} color={CREAM} textAlign="middle-left" textWrap="wrap" />
            )}
            <Label
              value={`COMMUNITY PROGRESS  ${missionProgress()} / ${missionTarget()}`}
              fontSize={13}
              color={GOLD}
              textAlign="middle-left"
            />
            {/* progress bar */}
            <UiEntity
              uiTransform={{ width: '100%', height: 10, margin: { top: 6, bottom: 6 } }}
              uiBackground={{ color: Color4.fromHexString('#00000066') }}
            >
              <UiEntity
                uiTransform={{
                  width: `${Math.min(100, (missionProgress() / missionTarget()) * 100)}%`,
                  height: '100%'
                }}
                uiBackground={{ color: GOLD }}
              />
            </UiEntity>
            {/* the player's own contribution to the mission */}
            <Label
              value={
                playerHasParticipated()
                  ? `✓ YOU HELPED: ${playerContributedText()}`
                  : missionCompleted()
                    ? 'This garden was restored by the community.'
                    : 'Help the world remember: approach the Memory Tree.'
              }
              fontSize={12}
              color={CREAM}
              textAlign="middle-left"
              textWrap="wrap"
            />
          </UiEntity>
        </UiEntity>
      )}

      {/* collapsed mission chip: one thumb tap reopens */}
      {!stoneOpen && missionState.mission && missionPanelCollapsed && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 150 },
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center'
          }}
        >
          <Button
            value={`COMMUNITY TREE  ${missionProgress()} / ${missionTarget()}`}
            variant="secondary"
            fontSize={15}
            uiTransform={{ width: 260, height: 44 }}
            onMouseDown={() => (missionPanelCollapsed = false)}
          />
        </UiEntity>
      )}

      {/* ritual banner + onboarding overlay, centered, above the HUD */}
      {(ritualText || onboardingLine) && !stoneOpen && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 120 },
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          {ritualText && (
            <UiEntity
              uiTransform={{ padding: { top: 10, bottom: 10, left: 26, right: 26 } }}
              uiBackground={{ color: PANEL }}
            >
              <Label value={ritualText} fontSize={20} color={GOLD} textAlign="middle-center" />
            </UiEntity>
          )}
          {onboardingLine && !ritualText && (
            <UiEntity
              uiTransform={{ padding: { top: 12, bottom: 12, left: 28, right: 28 } }}
              uiBackground={{ color: Color4.fromHexString('#14100cf2') }}
            >
              <Label value={onboardingLine} fontSize={18} color={CREAM} textAlign="middle-center" />
            </UiEntity>
          )}
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
