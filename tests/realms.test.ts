// Memory Realms: deterministic daily selection, data validity, and the
// wrong-realm rejection guarantees. Pure shared-module tests (no engine).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ALL_OBJECTIVE_IDS,
  REALMS,
  objectiveWorld,
  realmById,
  realmForDay,
  realmOfObjective
} from '../shared/realms'
import { expeditionFromServer, fragmentsForDay, realmForExpeditionDay, dailySeed, dayKeyFromDate } from '../shared/expedition'

const PLAYER = '0x' + '1'.repeat(40)

// 1 + 2: same date + world -> same realm; realm is valid
test("today's realm is deterministic for a given date", () => {
  assert.equal(realmForDay('2026-08-16').id, realmForDay('2026-08-16').id)
  assert.equal(realmForExpeditionDay('2026-08-16').id, realmForExpeditionDay('2026-08-16').id)
  // different days can rotate; at minimum the realm is always one of the 3
  for (const d of ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19']) {
    assert.ok(REALMS.some((r) => r.id === realmForDay(d).id), `${d} -> a valid realm`)
  }
})

// 3: every realm is well formed (3 objectives, landmarks, story)
test('every realm is well-formed', () => {
  for (const r of REALMS) {
    assert.equal(r.objectives.length, 3, `${r.id} has 3 objectives`)
    assert.ok(r.name && r.description, `${r.id} has name+description`)
    assert.ok(r.entry.name && r.mid.name && r.final.name, `${r.id} has landmarks`)
    assert.equal(r.story.fragLines.length, 3, `${r.id} story fragLines`)
    assert.ok(r.story.final, `${r.id} has final line`)
    // objectives belong to this realm
    for (const o of r.objectives) {
      assert.equal(realmOfObjective(o.id)?.id, r.id, `${o.id} owned by ${r.id}`)
      const pos = objectiveWorld(o.id)
      assert.ok(pos, `${o.id} has a world position`)
      assert.ok(o.flavor && o.flavor.trim().length > 0, `${o.id} has a discovery flavor (used by the MEMORY FOUND toast)`)
    }
  }
})

// 4: today's fragments all belong to today's realm
test("today's three fragments all belong to today's realm", () => {
  const day = dayKeyFromDate(new Date())
  const realm = realmForExpeditionDay(day)
  const route = fragmentsForDay(day)
  assert.equal(route.length, 3)
  for (const id of route) {
    assert.equal(realmOfObjective(id)?.id, realm.id, `${id} in ${realm.id}`)
  }
})

// 5 + 6: invalid-realm payloads are rejected by the validator
test('unknown realm id is rejected', () => {
  const day = '2026-08-20'
  const own = fragmentsForDay(day)[0]
  assert.throws(() =>
    expeditionFromServer({
      day,
      seed: 1,
      realm: { id: 'not_a_realm', name: 'fake' },
      fragments: [{ id: own, location: { x: 1, z: 1 }, realmId: 'x', hits: 0, collected: false }],
      completed: false,
      todayCompletions: 0
    })
  )
})

// explicit wrong-realm rejection (all fragments owned by a different realm)
test('a payload whose fragments belong to a different realm is rejected', () => {
  const day = '2026-08-21'
  const realm = realmForExpeditionDay(day)
  const other = REALMS.find((r) => r.id !== realm.id)!
  const alien = other.objectives[0].id
  assert.throws(() =>
    expeditionFromServer({
      day,
      seed: dailySeed(day),
      realm: { id: realm.id, name: realm.name },
      fragments: [
        { id: alien, location: objectiveWorld(alien), realmId: realm.id, hits: 0, collected: false },
        { id: alien, location: objectiveWorld(alien), realmId: realm.id, hits: 0, collected: false },
        { id: alien, location: objectiveWorld(alien), realmId: realm.id, hits: 0, collected: false }
      ],
      completed: false,
      todayCompletions: 0
    })
  )
})

test('realmById resolves and round-trips', () => {
  for (const r of REALMS) assert.equal(realmById(r.id)?.id, r.id)
  assert.equal(realmById('nope'), undefined)
})

test('objectives are unique across the whole pool', () => {
  assert.equal(new Set(ALL_OBJECTIVE_IDS).size, ALL_OBJECTIVE_IDS.length)
})
