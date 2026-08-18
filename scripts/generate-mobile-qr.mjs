#!/usr/bin/env node
// generate-mobile-qr.mjs — emit a QR PNG that opens The World Remembers in
// Decentraland. The QR encodes ONLY the official launch URL (never the API,
// never the Neon DB, never a JSON payload).
//
// Usage:
//   DEV:   node scripts/generate-mobile-qr.mjs --env dev --preview <https://tunnel> [--out qr.png]
//   WORLD: node scripts/generate-mobile-qr.mjs --env world --world <name>    [--out qr.png]
//          (world defaults to $WR_WORLD_NAME; unset -> PRODUCTION_BLOCKED, exit 1)
//
// Also prints the launch URL so it can be checked independent of the image.

import { writeFileSync } from 'node:fs'
import QRCode from 'qrcode'
import { resolveLaunch, DEFAULT_POSITION } from './mobile-link.mjs'

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) {
    const key = a.slice(2)
    const val = process.argv[i + 1]
    if (val !== undefined && !val.startsWith('--')) { args[key] = val; i++ }
    else args[key] = true
  }
}

const env = args.env === 'world' ? 'world' : 'dev'
const previewUrl = args.preview || process.env.WR_PREVIEW_URL
const worldName = args.world || process.env.WR_WORLD_NAME
const position = args.position || DEFAULT_POSITION
const out = args.out || `/tmp/worldremembers-${env}-qr.png`

const res = resolveLaunch({ env, previewUrl, worldName, position })

console.log(`[env]     ${res.kind}`)
if (!res.ok) {
  console.error(`[blocked] ${res.reason}`)
  process.exit(1)
}
console.log(`[url]     ${res.url}`)

const png = await QRCode.toBuffer(res.url, { errorCorrectionLevel: 'M', margin: 3, width: 640 })
writeFileSync(out, png)
console.log(`[qr]      ${out}`)
