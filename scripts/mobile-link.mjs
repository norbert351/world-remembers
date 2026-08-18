#!/usr/bin/env node
// mobile-link.mjs — SINGLE SOURCE OF TRUTH for The World Remembers mobile launch URLs.
//
// The World Remembers is a Decentraland SDK7 World. The QR handed to a judge or
// a reviewer must open THIS WORLD. Decentraland's official launch mechanisms:
//
//   DEV preview   -> decentraland://open?preview=<preview-host>&position=<x,y>
//                    (only reachable from a phone on the SAME LAN as the preview
//                     server; a Cloudflare tunnel substitutes when the server is
//                     on a remote/cloud machine, but the mobile app only handles
//                     previews reliably for local previews / deployed Worlds)
//
//   PRODUCTION    -> https://play.decentraland.org/?realm=<NAME>.dcl.eth&position=<x,y>
//                    (the official Explorer URL the Decentraland mobile app opens
//                     natively for a DEPLOYED World)
//
// The API / Neon DB are NEVER part of the launch URL. The QR encodes ONLY the
// Decentraland launch URL. Everything below is the single source used by both
// the generator (scripts/generate-mobile-qr.mjs) and the validator
// (scripts/validate-mobile-qr.mjs).

export const DEV_SCHEME = 'decentraland://open'
export const WORLD_PLAY_BASE = 'https://play.decentraland.org'
export const DEFAULT_POSITION = '0,0'

// World name may be given with or without the .dcl.eth suffix; normalize it.
function normalizeWorld(name) {
  const n = String(name || '').trim().replace(/\.dcl\.eth$/i, '')
  return n ? `${n}.dcl.eth` : ''
}

// Dev preview deep link: opens in the DCL mobile app when the app can reach
// `previewUrl` (same LAN for the official flow, or a public tunnel on a cloud VM).
export function buildDevLaunchUrl({ previewUrl, position = DEFAULT_POSITION }) {
  return `${DEV_SCHEME}?preview=${previewUrl}&position=${position}`
}

// Production World launch URL: the official Explorer URL the mobile app opens.
export function buildWorldLaunchUrl({ worldName, position = DEFAULT_POSITION }) {
  const realm = normalizeWorld(worldName)
  if (!realm) throw new Error('buildWorldLaunchUrl: worldName is required (e.g. "world-name")')
  return `${WORLD_PLAY_BASE}/?realm=${realm}&position=${position}`
}

// IllegalArgumentException-style guard list of private / dev-only hosts that must
// never appear in a PRODUCTION launch URL.
export const PRIVATE_HOST_RE = /localhost|127\.0\.0\.1|(^|[^0-9A-Za-z])0\.0\.0\.0|(^|[^0-9A-Za-z])10\.|(^|[^0-9A-Za-z])192\.168\.|(^|[^0-9A-Za-z])172\.(1[6-9]|2[0-9]|3[01])\./
export const SECRET_RE = /DATABASE_URL|postgres:\/\/|postgresql:\/\/|neon\.tech|AWSAccessKey|AKIA[A-Z0-9]{16}|password\s*=|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|Bearer [A-Za-z0-9]/

// Decide which kind of launch URL to produce and whether it is valid.
// Returns { kind, url, ok, reason }.
export function resolveLaunch({ env = 'dev', previewUrl, worldName, position = DEFAULT_POSITION }) {
  if (env === 'world') {
    const realm = normalizeWorld(worldName)
    if (!realm) {
      return {
        kind: 'world',
        ok: false,
        reason: 'PRODUCTION_BLOCKED: World must be deployed and assigned its official .dcl.eth identity before a production QR can be generated. Provide WORLD_NAME (once the World exists) to emit the play.decentraland.org World link.'
      }
    }
    const url = buildWorldLaunchUrl({ worldName: realm, position })
    return { kind: 'world', ok: true, url, reason: '' }
  }
  // dev
  if (!previewUrl) {
    return { kind: 'dev', ok: false, reason: 'DEV: a preview URL is required (the current Cloudflare preview tunnel).' }
  }
  return { kind: 'dev', ok: true, url: buildDevLaunchUrl({ previewUrl, position }), reason: '' }
}

// Validate an arbitrary decoded launch URL against a target env. Pure, no I/O.
// `allowedDevHost` may be supplied to whitelist the known preview host.
export function validateLaunchUrl({ payload, env = 'world', allowedDevHost }) {
  const issues = []
  const has = (re) => re.test(payload)

  // secrets / credentials / DB — never allowed in any launch URL
  if (has(SECRET_RE)) issues.push('contains a secret / DB credential (DATABASE_URL, postgres, key, password)')

  if (env === 'world') {
    if (has(PRIVATE_HOST_RE)) issues.push('contains a private/LAN/localhost host')
    if (/^http:\/\//i.test(payload)) issues.push('production must be https')
    if (/preview|decentraland:\/\/open/i.test(payload)) issues.push('production URL must NOT be a dev preview deep link')
    const m = payload.match(/realm=([^&]+)/i)
    if (payload.startsWith(WORLD_PLAY_BASE)) {
      if (!m) issues.push('production play.decentraland.org URL is missing the realm query param')
      else if (!/\.dcl\.eth$/i.test(decodeURIComponent(m[1]))) issues.push(`realm "${m[1]}" must be a .dcl.eth world identity`)
    } else if (!/play\.decentraland\.org\/.*\?realm=/i.test(payload)) {
      issues.push('production URL must be the official https://play.decentraland.org/?realm=… format')
    }
  } else {
    // dev preview deep link
    if (!payload.startsWith(DEV_SCHEME)) issues.push(`dev URL must start with ${DEV_SCHEME}`)
    else {
      const pm = payload.match(/preview=([^&]+)/i)
      if (!pm) issues.push('dev preview URL is missing the preview=<host> param')
      else {
        const host = pm[1]
        if (PRIVATE_HOST_RE.test(host)) issues.push('preview host is a private/LAN/localhost host unreachable from a remote phone')
        if (SECRET_RE.test(host)) issues.push('preview host carries a secret/DB credential')
        if (allowedDevHost && host !== allowedDevHost) issues.push(`preview host does not match the known preview host (${allowedDevHost})`)
      }
    }
    if (!/position=/.test(payload)) issues.push('missing position param')
  }

  return { ok: issues.length === 0, issues }
}
