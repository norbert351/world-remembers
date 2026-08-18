# Mobile QR Test — The World Remembers (Decentraland)

How to verify the launch QR opens the World in the Decentraland mobile app.

## What the QR actually contains

The QR encodes **only** a Decentraland launch URL. It never contains the API
endpoint, the Neon database, or credentials.

| Flow | URL the QR encodes |
|---|---|
| DEV preview (local/Wi-Fi test) | `decentraland://open?preview=<preview-host>&position=0,0` |
| DEV preview (cloud VM, tunnel) | `decentraland://open?preview=<https-tunnel>&position=0,0` |
| PRODUCTION World | `https://play.decentraland.org/?realm=<NAME>.dcl.eth&position=0,0` |

The mobile app opens the **production World** link natively. The `decentraland://open?preview=` links are for development: they only load the preview when the phone can actually reach the preview host (same Wi-Fi), so a tunnel on a cloud VM is **not** a substitute for a deployed World on a judge's phone.

## 1. Prerequisites

1. Install the **Decentraland** app (App Store / Play Store) and open it at least once.
2. For the PRODUCTION link: the World must be deployed (see `REQUIRED ACTION` below). There is currently **no deployed World identity** on this project, so the production QR cannot be generated yet (the generator reports `PRODUCTION_BLOCKED`).

## 2. Simple phone test

1. Open the phone camera (iPhone camera / Android camera or a QR reader).
2. Scan the production QR.
3. The Decentraland app opens (it is installed).
4. The World Remembers loads (144-parcel World, today's Memory Realm).
5. The player can walk around and enter the realm portal.
6. The Memory Tree / stones render.
7. The game data loads (calls the HTTPS API, which reads Neon).
8. **Mission / expedition data loads** (today's realm + 3 objectives).
9. **Contribution still persists** (tap a stone, reload, it is still remembered).
10. Record PASS / FAIL below.

## 3. Matrix

| Environment | Expected | Result |
|---|---|---|
| iPhone Safari/camera scans production QR | DCL app opens the World | ☐ PASS / ☐ FAIL |
| Android camera/Chrome scans production QR | DCL app opens the World | ☐ PASS / ☐ FAIL |
| QR scanned, DCL app already installed | app opens the World | ☐ PASS / ☐ FAIL |
| QR scanned, DCL app **not** installed | official DCL fallback (app store / download page) | ☐ PASS / ☐ FAIL |
| Same QR a second time | still opens the World | ☐ PASS / ☐ FAIL |

## 4. If it fails

- **App opens but scene is black** → bundle/typecheck problem, not the QR.
- **App opens but nothing loads / spinner** → the scene cannot reach `API.baseUrl` (check the tunnel/HTTPS API is up).
- **Scanner says "no data"** → the QR image is corrupt; regenerate.
- **Nothing happens at all** → the Decentraland app may not be installed, or an iOS/Android camera is not handling the custom deep link; open the URL manually in the app's browser once.

## REQUIRED ACTION (before judging)

The World is **not yet deployed**. To produce the final production QR:

1. Author the World: add to `scene.json` a `worldConfiguration` with the world `name` (a NAME you own on your wallet, e.g. `world-remembers.dcl.eth`) — do NOT use a bare land-only scene for a World.
2. Deploy the World from a machine with your Decentraland identity:
   ```bash
   npm run build
   npx @dcl/sdk-commands deploy --target-content worlds-content-server.decentraland.org/world/world-remembers
   ```
   (Sign with your DCL wallet when prompted.)
3. Point the scene at the public HTTPS API in `src/config.ts` (`API.baseUrl`) and rebuild.
4. Generate and validate the production QR:
   ```bash
   node scripts/generate-mobile-qr.mjs --env world --world world-remembers --out world-qr.png
   node scripts/validate-mobile-qr.mjs --env world --qr world-qr.png
   ```
5. Scan the production QR with the phone and run the matrix above.
