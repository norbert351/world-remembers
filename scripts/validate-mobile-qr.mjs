#!/usr/bin/env node
// validate-mobile-qr.mjs — decode a QR PNG payload and validate the launch URL.
//
// Does NOT accept "a QR image was generated" as proof: it reads the image back,
// extracts the encoded URL, and checks it against strict rules.
//
// Usage:
//   Validate a generated PNG:
//     node scripts/validate-mobile-qr.mjs --env world --qr /path/qr.png [--allowed-dev-host <host>]
//   Validate a URL string directly (no image):
//     node scripts/validate-mobile-qr.mjs --env world --url 'https://play.decentraland.org/?realm=x.dcl.eth&position=0,0'
//
// Exit 0 only when the decoded payload passes every rule for the target env.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { validateLaunchUrl } from './mobile-link.mjs'

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
const env = args.env === 'dev' ? 'dev' : 'world'
const allowedDevHost = args['allowed-dev-host']

// Decode the QR image with OpenCV (cv2.QRCodeDetector).
function decodePng(path) {
  const script = `
import cv2, sys
img = cv2.imread(sys.argv[1])
if img is None:
    print("DECODE_ERR:unreadable"); sys.exit(3)
d = cv2.QRCodeDetector()
data, pts, _ = d.detectAndDecode(img)
print(data if data else "DECODE_ERR:no-qr-found")
`
  const out = execFileSync('python3', ['-c', script, path], { encoding: 'utf8' }).trim()
  if (out.startsWith('DECODE_ERR')) throw new Error(out)
  return out
}

let payload
if (args.url) {
  payload = args.url
  console.log('[source]  url-arg')
} else if (args.qr) {
  payload = decodePng(args.qr)
  console.log('[source]  decoded from QR image -> ' + payload)
} else {
  console.error('Provide --qr <png> or --url <launch-url>')
  process.exit(2)
}

const { ok, issues } = validateLaunchUrl({ payload, env, allowedDevHost })

console.log(`[env]     ${env}`)
if (ok) {
  console.log('[result]  PASS — launch URL is valid for ' + env)
  process.exit(0)
} else {
  console.error('[result]  FAIL — ' + issues.length + ' issue(s):')
  for (const i of issues) console.error('          - ' + i)
  process.exit(1)
}
