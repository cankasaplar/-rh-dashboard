# Firebase data schema

Castle Genesis reads public data and writes presence telemetry under a sanitized
application id. Invalid Realtime Database path characters in the app id are
replaced with underscores.

## Runtime config

The app ships with the `castle-genesis` Firebase web config:

- App nickname: `castle genesis`
- App ID: `1:249221773705:web:5b29fb17e0c1746a968958`
- Hosting site: `castle-genesis`
- Measurement ID: `G-JS2YX02B12`

Override config with either `window.__firebase_config` or `VITE_FIREBASE_CONFIG`
when running in a different Firebase project. `VITE_APP_ID` defaults to
`castle-genesis`.

## Firestore reads

- `artifacts/{appId}/public/data/memoryShards/{shardId}`
  - `content`: string
  - `tags`: string array, include `codex-2025-07-12` to display the shard
- `artifacts/{appId}/public/data/protests/{protestId}`
  - `status`: string, use `active` to display the protest in state

## Realtime Database reads

- `artifacts/{appId}/cells/{cellId}/agents/{agentId}`
  - `pos.lat`: number
  - `pos.lng`: number

## Realtime Database writes

- `presence/{appId}/users/{uid}`
  - `status`: `online`
  - `ts`: epoch milliseconds
  - `cellId`: current cell id
- `telemetry/{appId}/{uid}`
  - `fps`: number
  - `quality`: number
  - `agents`: number
  - `ts`: epoch milliseconds

## Cloud Function

The command input calls the callable function `resolveCausalAction` in
`europe-west3` with:

- `command`
- `cellId`
- `version`
- `timestamp`

The included function validates commands, writes accepted commands to
`artifacts/castle-genesis/public/data/commands`, and returns the normalized
command payload.
