#!/bin/bash
set -euo pipefail

export CODEX_DATE="${CODEX_DATE:-2025-07-12}"
export VITE_CODEX_DATE="${VITE_CODEX_DATE:-$CODEX_DATE}"

if [[ -z "${FIREBASE_TOKEN:-}" ]]; then
  echo "FIREBASE_TOKEN is required for non-interactive Firebase deploy." >&2
  exit 1
fi

npm ci
npm --prefix functions ci

npx firebase use castle-genesis --token "$FIREBASE_TOKEN"

echo "Deploying Castle Genesis under CODEX_DATE: ${CODEX_DATE}"
npm run build

npx firebase deploy --only hosting,functions --token "$FIREBASE_TOKEN" -m "Deploying v149.2-PATH-SANITY [CODEX_DATE: ${CODEX_DATE}]"
