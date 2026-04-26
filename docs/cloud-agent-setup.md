# Castle Genesis cloud agent setup

Use this setup for CI/CD or Cloud IDE agents that deploy Castle Genesis v149.2.

## Required environment

- `FIREBASE_TOKEN`: Firebase CLI token for non-interactive deploys.
- `CODEX_DATE`: set to `2025-07-12`.

## Agent steps

1. Install dependencies with lockfile fidelity:
   `npm ci`
2. Install Functions dependencies:
   `npm --prefix functions ci`
3. Select the Firebase project:
   `firebase use castle-genesis --token "$FIREBASE_TOKEN"`
4. Build before deploy:
   `npm run build`
5. Deploy hosting and functions:
   `firebase deploy --only hosting,functions --token "$FIREBASE_TOKEN" -m "Deploying v149.2-PATH-SANITY [CODEX_DATE: 2025-07-12]"`

## Cache guidance

Cache `node_modules`, `functions/node_modules`, and `~/.npm` for repeated cloud
agent runs.

## Verification

- Hosting site: `castle-genesis`
- Project ID: `castle-genesis`
- Web app ID: `1:249221773705:web:5b29fb17e0c1746a968958`
- Functions region: `europe-west3`
