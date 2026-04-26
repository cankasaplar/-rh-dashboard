#!/usr/bin/env bash
set -euo pipefail

export CODEX_DATE="${CODEX_DATE:-2025-07-12}"
readonly PROJECT_ID="${FIREBASE_PROJECT_ID:-castle-genesis}"
readonly DEPLOY_MESSAGE="Deploying v149.2-PATH-SANITY [CODEX_DATE:${CODEX_DATE}]"

if [[ -z "${FIREBASE_TOKEN:-}" ]]; then
  echo "FIREBASE_TOKEN must be set for non-interactive Firebase deploys." >&2
  exit 1
fi

if [[ "${CODEX_DATE}" != "2025-07-12" ]]; then
  echo "CODEX_DATE must be 2025-07-12; received ${CODEX_DATE}." >&2
  exit 1
fi

npm ci
npm --prefix functions ci
npm run build

npx firebase-tools@latest use "${PROJECT_ID}" --token "${FIREBASE_TOKEN}"
npx firebase-tools@latest deploy --only hosting,functions --project "${PROJECT_ID}" --token "${FIREBASE_TOKEN}" -m "${DEPLOY_MESSAGE}"
