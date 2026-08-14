# PHONE TEST GUIDE — The World Remembers (Phase C gate)

Real-device validation of the persistent Memory Tree loop.
No features, no refactors, no backend changes. This document only.

## Topology

```
[ PHONE: Decentraland mobile app ]  --Wi-Fi-->  [ WINDOWS DEV MACHINE ]
   loads scene preview (:8001)                    preview server (npm start)
   fetches world API  (:3002)                     Express API (npm start, backend/)
                                                  PostgreSQL (local, :5432)
```

The phone and the Windows machine must be on the same Wi-Fi network.
Guest/captive Wi-Fi with client isolation will block the connection.

## 1. What to run and where

### Windows machine — one-time setup

1. Install Node.js 20+ (https://nodejs.org), PostgreSQL 16 (https://www.postgresql.org,
   default port 5432, remember the postgres superuser password), git.
2. Phone: install the Decentraland mobile app (App Store / Play Store).
3. Get the project on the machine:
   ```powershell
   git clone <your-world-remembers-repo-url>
   cd world-remembers
   ```

### Windows machine — backend (runs the API + PostgreSQL)

```powershell
cd backend
npm install

# create the database (Windows psql uses the port from the installer, 5432)
psql -U postgres -c "CREATE ROLE worldremembers LOGIN PASSWORD 'pick-a-password';"
psql -U postgres -c "CREATE DATABASE world_remembers OWNER worldremembers;"

# configure (edit the file after copying)
Copy-Item .env.example .env
#   DATABASE_URL=postgres://worldremembers:pick-a-password@127.0.0.1:5432/world_remembers
#   PORT=3002
#   CORS_ORIGIN=*

npm run db:migrate
npm run build
npm start
```

Verify the API locally before touching the phone:
```powershell
curl http://localhost:3002/health     # {"status":"ok","db":"up"}
curl http://localhost:3002/world      # {"contributions":N,"stage":"..."}
```

### Windows machine — firewall (both ports must be reachable from the phone)

Run PowerShell as administrator:
```powershell
netsh advfirewall firewall add rule name="World API 3002" dir=in action=allow protocol=TCP localport=3002 profile=private enable=yes
netsh advfirewall firewall add rule name="Node Inbound" dir=in action=allow program="C:\Program Files\nodejs\node.exe" profile=private enable=yes
```
(The second rule covers the scene preview port, which is dynamic around 8001.)

### Windows machine — scene (runs the preview the phone opens)

```powershell
cd ..          # back to world-remembers root
npm install

# 1. find your LAN IP (the phone must reach this address)
ipconfig       # IPv4 Address of the active adapter, e.g. 192.168.1.50

# 2. point the scene at the API on the LAN (ONE value, src/config.ts)
#    change: baseUrl: 'http://127.0.0.1:3002'
#    to:     baseUrl: 'http://192.168.1.50:3002'

# 3. optional but recommended: start from a clean world
psql -U worldremembers -d world_remembers -c "TRUNCATE contributions;"

# 4. start the preview with the mobile QR code
npm run start -- --mobile
```

The terminal shows a QR code. If the QR does not render or scan in your
terminal, get the deep link as JSON:
```powershell
curl http://localhost:8001/mobile-preview
# use the "url" field, e.g. decentraland://open?preview=http://192.168.1.50:8001&position=0,0
```

### Phone

1. Join the same Wi-Fi.
2. Open the Decentraland mobile app (guest login is fine, no wallet needed).
3. Scan the QR code from the terminal (or use the deep link).
4. The scene loads. Run the checklists below.

## 2. Which machine runs the API

The Windows dev machine. PostgreSQL also runs there. Nothing else needed.

## 3. Which address the phone uses

| What | Address | Where it comes from |
|---|---|---|
| Scene preview | `http://<LAN-IP>:8001` | encoded in the QR automatically |
| World API | `http://<LAN-IP>:3002` | `API.baseUrl` in `src/config.ts`, change it by hand |

Both use the same LAN IP from `ipconfig`. Do not use `127.0.0.1` or
`localhost` anywhere on the phone path, the phone must reach the machine
over Wi-Fi.

## 4. Which command starts the scene

```powershell
npm run start -- --mobile
```
from the `world-remembers` root, with the backend still running in another
terminal. The desktop DCL client also works as a secondary check
(`npm run start` without `--mobile`) but the gate requires the phone.

## 5. Which configuration value must change

One value only, in `world-remembers/src/config.ts`:

```ts
export const API = {
  baseUrl: 'http://<LAN-IP>:3002'   // was http://127.0.0.1:3002
}
```

Nothing else in the scene changes. The backend reads `DATABASE_URL`,
`PORT`, `CORS_ORIGIN` from `backend/.env`.

## 6. How to verify PostgreSQL directly

Do not trust the UI. On the Windows machine:

```powershell
# total count
psql -U worldremembers -d world_remembers -c "SELECT COUNT(*) FROM contributions;"

# latest contributions with attribution and time
psql -U worldremembers -d world_remembers -c "SELECT id, player_id, created_at FROM contributions ORDER BY id DESC LIMIT 5;"

# world state as the scene sees it
curl http://localhost:3002/world
```

## 7. Persistence test (the gate)

1. Record the count before: `curl http://localhost:3002/world` (or psql).
2. In the scene, tap the Memory Tree once. Wait for the toast.
3. Record the count after.
4. Leave the world and re-enter (reload the scene, or close/reopen the preview).
5. Record the count again.
6. PASS requires: `count_after_reload == count_after_contribution == count_before + 1`
7. Cross-check with psql, not the UI.

## 8. Network tests

| Scenario | How | Expected |
|---|---|---|
| API available | normal tap | success toast, counter +1, pulse after confirmation |
| API unavailable | stop the backend (Ctrl+C), tap the tree | scene stays usable, no crash, error toast "The memory couldn't be saved. Try again.", counter unchanged, no pulse |
| API back | restart backend, tap | success again, counter +1 |

Also confirm no false success: with the API down, the toast must NOT say
"The tree remembers", and the counter must not move.

## 9. PASS/FAIL checklist

Record PASS or FAIL for each row. Add notes where useful.

### Core loop
- [ ] Scene loads
- [ ] Time to first visible environment (seconds): ____
- [ ] Memory Tree visible and central
- [ ] Tree interaction targeting (tap hits the tree, not empty space)
- [ ] Mobile interaction UI present ("HELP THE TREE GROW")
- [ ] Tap once registers exactly one contribution
- [ ] Saving state appears ("SAVING..." on the button; on LAN it may flash very briefly)
- [ ] Server receives the contribution (check API log or psql)
- [ ] PostgreSQL contains the contribution (psql, direct)
- [ ] Returned world state updates the counter
- [ ] Tree pulse happens after the success confirmation
- [ ] Success toast appears
- [ ] Leave/reload: contribution remains
- [ ] Tree state remains correct after reload (stage matches the count)

### Mobile UX
- [ ] 300x76 button usable with one thumb
- [ ] One-thumb operation overall
- [ ] Text readable at arm's length
- [ ] Counter readable
- [ ] Toast readable
- [ ] Offline chip readable (only when API is down)
- [ ] Camera behavior feels natural
- [ ] Walking around the tree works (no invisible walls, no clipping)
- [ ] No accidental double contributions from rapid taps
- [ ] Network failure behavior is graceful
- [ ] Overall responsiveness feels good
- [ ] No obvious FPS problems (target 30+)

### Stage progression (optional but quick, via psql seeding)
- [ ] 100 contributions -> AWAKENED after reload
- [ ] 250 contributions -> GROWING after reload
- [ ] 500 contributions -> FLOURISHING after reload
```powershell
psql -U worldremembers -d world_remembers -c "INSERT INTO contributions (player_id) SELECT '0x' || lpad(i::text,40,'0') FROM generate_series(1,99) i;"
```
(run after truncating to 0, or adjust the numbers to reach the boundary)

## 10. Report back

After the run, report per row PASS/FAIL plus:
- contribution counts before / after / after-reload
- psql output proving the rows
- any crash, freeze, or wrong behavior observed

Only then do we design Phase D.
