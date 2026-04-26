# Castle Genesis Gate

Firebase Hosting uzerinde calisan React, Three.js ve Firebase realtime dashboard.

## Yerel calistirma

1. Bagimliliklari kurun: `npm install`
2. Firebase ayarlarini ortam degiskeni olarak verin:
   `VITE_FIREBASE_CONFIG='{"apiKey":"...","authDomain":"...","projectId":"castle-genesis","databaseURL":"...","appId":"..."}'`
3. Istege bagli app id verin: `VITE_APP_ID=castle-genesis`
4. Gelistirme sunucusunu acin: `npm run dev`

## Build ve yayinlama

- Uretim build'i: `npm run build`
- Firebase Hosting yayini: `npm run deploy`
- Hosting hedef dosyasi: `https://castle-genesis.web.app/index-gate.html`

## Firebase veri yollari

Uygulama RTDB icin Firebase tarafindan yasaklanan karakterleri app id'den temizler.

- Firestore memory shards: `artifacts/{appId}/public/data/memoryShards`
- Firestore protests: `artifacts/{appId}/public/data/protests`
- RTDB agents: `artifacts/{appId}/cells/c_alpha_sim/agents`
- RTDB presence: `presence/{appId}/users/{uid}`
- RTDB telemetry: `telemetry/{appId}/{uid}`

Komut gonderimi `europe-west3` bolgesindeki `resolveCausalAction` callable function'ini cagirir.
