#!/usr/bin/env bash
# security-scan.sh — verify The World Remembers CLIENT never ships a secret.
# Scans the scene source, scene config, and the served bundle (bin/index.js)
# for DATABASE_URL, postgres://, Neon, keys, passwords, and tokens. The client
# must only know the public HTTPS API endpoint.
set -uo pipefail
cd "$(dirname "$0")/.."

PATTERNS=(
  'DATABASE_URL'
  'postgres://'
  'postgresql://'
  'neon\.tech'
  'PGPASSWORD'
  'AMAZON_AWS_ACCESS_KEY_ID'
  'AKIA[0-9A-Z]{16}'
  'PRIVATE KEY-----'
  'xox[baprs]-'
  'ghp_[A-Za-z0-9]{20,}'
  'sk-[A-Za-z0-9]{20,}'
  'AIza[0-9A-Za-z_-]{30,}'
)
RE="$(IFS='|'; echo "${PATTERNS[*]}")"

# 1) source + scene config (exclude node_modules, bin bundle, docs examples)
SRC_HITS=$(grep -rInE "$RE" src shared scene.json 2>/dev/null || true)

# 2) the shipped bundle the client downloads
BUNDLE=bin/index.js
BUNDLE_HITS=""
if [[ -f "$BUNDLE" ]]; then
  BUNDLE_HITS=$(grep -nE "$RE" "$BUNDLE" || true)
fi

echo "== security scan: The World Remembers client =="
if [[ -n "$SRC_HITS" ]]; then
  echo "FAIL — secret-like content in scene source/config:"
  echo "$SRC_HITS"
  exit 1
fi
if [[ -n "$BUNDLE_HITS" ]]; then
  echo "FAIL — secret-like content in shipped bundle bin/index.js:"
  echo "$BUNDLE_HITS"
  exit 1
fi
echo "PASS — no DATABASE_URL / postgres / Neon / keys / tokens in src, shared, scene.json, or bin/index.js"
echo "note: did not scan backend/ (server-side, holds real credentials by design), tests (neon schema refs), README/docs"
exit 0
