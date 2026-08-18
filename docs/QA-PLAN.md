# Real-Player QA Plan — The World Remembers (competition gate)

Run these on a physical device in the **deployed World** (see below). Record
results in the tables. Do NOT call the game production-ready until the World is
deployed and Tests A–D pass on a physical phone.

> Status legend: GREEN = verified · YELLOW = needs real device · RED = blocking

## Precondition — deployed World

The DCL mobile app only opens a deployed World. Before any phone test:

1. Add a `worldConfiguration.name` to `scene.json` (a NAME you own, e.g. `world-remembers.dcl.eth`).
2. Deploy with your DCL identity:
   ```bash
   npm run build
   npx @dcl/sdk-commands deploy --target-content worlds-content-server.decentraland.org/world/<your-name>
   ```
   (Sign with your DCL wallet when prompted.)
3. Point `src/config.ts` `API.baseUrl` at the public HTTPS API that the scene can reach, rebuild.
4. Generate + validate the World QR:
   ```bash
   node scripts/generate-mobile-qr.mjs --env world --world <your-name> --out world-qr.png
   node scripts/validate-mobile-qr.mjs --env world --qr world-qr.png    # must PASS
   ```

---

## TEST A — Fresh solo player

Player has never seen the game. Record timings and issues.

| Step | Measure | Result |
|---|---|---|
| 0–3s: know it's a mysterious world | reaction | ☐ |
| 3–7s: "the world has forgotten something" | onboarding + mission card visible | ☐ |
| 7–12s: "find today's memories" | card shows TODAY'S MEMORY + dots + NEXT + distance | ☐ |
| 12–20s: "I know where to go" | NEXT line + beacon + trail guide | ☐ |
| 20–30s: "I am exploring" | moving toward realm | ☐ |
| First interaction | time __s; was the CTA obvious? | ☐ |
| First memory collected | time __s; MEMORY FOUND flavor shown? | ☐ |
| Guardian defeat reads (0/3→3/3 visual) | escalation felt? | ☐ |
| Confusion points / UI problems / camera problems / FPS | notes | ☐ |

## TEST B — Returning player

1. Complete the mission, leave, return later.
2. Verify: world remembers (tree/stones), journal updates, "While You Were Gone" panel, world level persists, and a (new) daily mission appears.

## TEST C — Two players

1. Two devices in the World. Verify both can see each other, both interact at memory sites, neither breaks the other's mission state, shared world level/community counts stay correct, and the "restored together" copy reads sensibly when both complete.

## TEST D — API failure

1. Stop the API. Verify: scene does not crash, shows the OFFLINE banner, no false success, the player can still move/explore.
2. Restart the API. Verify functionality returns without a reload requirement.

---

## Mobile UX checklist (one thumb, 48px+ targets)

- [ ] Mission card readable, collapses, reopens
- [ ] Contextual CTA stays up after rotating the camera while in range
- [ ] Journal opens/closes, rows correct, RARE MEMORY row present
- [ ] No tiny/in-precise buttons; nothing critical at unsafe screen edges
- [ ] No keyboard; no critical UI blocking the center view

## Security re-run (before submitting)

```bash
npm run security:scan        # must PASS
git status                    # confirm no .env / credentials tracked
```
