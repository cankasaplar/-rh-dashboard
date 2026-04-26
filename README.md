# Castle Genesis Gate

Firebase Hosting uzerinde calisan React, Three.js ve Firebase realtime dashboard.

## Firebase app

- Nickname: `castle genesis`
- Project ID: `castle-genesis`
- App ID: `1:249221773705:web:5b29fb17e0c1746a968958`
- Hosting site: `castle-genesis`
- Public URL: `https://castle-genesis.web.app/`
- CODEX date: `2025-07-12`

## Yerel calistirma

1. Bagimliliklari kurun: `npm install`
2. Istege bagli olarak Firebase ayarlarini override edin:
   `VITE_FIREBASE_CONFIG='{"apiKey":"...","authDomain":"...","projectId":"castle-genesis","databaseURL":"...","appId":"..."}'`
3. Istege bagli app id verin: `VITE_APP_ID=castle-genesis`
4. Gelistirme sunucusunu acin: `npm run dev`

## Build ve yayinlama

- Uretim build'i: `npm run build`
- Firebase Hosting ve Functions yayini: `npm run deploy`
- CI deploy script'i: `./ci_deploy.sh`
- Hosting hedef dosyasi: `https://castle-genesis.web.app/index.html`

CI ortaminda `FIREBASE_TOKEN` ve `CODEX_DATE="2025-07-12"` tanimli olmalidir.
Temiz kurulum icin `npm ci` ve `npm --prefix functions ci` kullanilir.

## Firebase veri yollari

Uygulama RTDB icin Firebase tarafindan yasaklanan karakterleri app id'den temizler.

- Firestore memory shards: `artifacts/{appId}/public/data/memoryShards`
- Firestore protests: `artifacts/{appId}/public/data/protests`
- RTDB agents: `artifacts/{appId}/cells/c_alpha_sim/agents`
- RTDB presence: `presence/{appId}/users/{uid}`
- RTDB telemetry: `telemetry/{appId}/{uid}`

Komut gonderimi `europe-west3` bolgesindeki `resolveCausalAction` callable function'ini cagirir.
