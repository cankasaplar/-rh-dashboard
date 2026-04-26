export type RuntimeEnv = { appId: string; codexVersion: string; codexAnchor: string; firebaseRegion: string; renderBudgetMs: number; maxNodes: number; sentryDsn?: string; firebase: { apiKey: string; authDomain: string; databaseURL: string; projectId: string; storageBucket: string; messagingSenderId: string; appId: string; measurementId: string } };
const fallbackAppId = 'castle-8cb15';
const readEnv = (key: string, fallback: string): string => { const value = import.meta.env[key]; return typeof value === 'string' && value.length > 0 ? value : fallback; };
export const runtimeEnv: RuntimeEnv = {
  appId: readEnv('VITE_APP_ID', fallbackAppId),
  codexVersion: readEnv('VITE_CODEX_VERSION', 'v157.0-RHIZOH-PRIME'),
  codexAnchor: readEnv('VITE_CODEX_ANCHOR', '2025-07-12'),
  firebaseRegion: readEnv('VITE_FIREBASE_REGION', 'europe-west3'),
  renderBudgetMs: Number(readEnv('VITE_RENDER_BUDGET_MS', '16.6')),
  maxNodes: Number(readEnv('VITE_MAX_NODES', '5000')),
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  firebase: {
    apiKey: readEnv('VITE_FIREBASE_API_KEY', 'AIzaSyB_Cl3B1QOmwPnVPkHu2WNtLzYHmbnIjPY'),
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN', `${fallbackAppId}.firebaseapp.com`),
    databaseURL: readEnv('VITE_FIREBASE_DATABASE_URL', `https://${fallbackAppId}-default-rtdb.firebaseio.com`),
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID', fallbackAppId),
    storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET', `${fallbackAppId}.firebasestorage.app`),
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '329052147568'),
    appId: readEnv('VITE_FIREBASE_WEB_APP_ID', '1:329052147568:web:cd67e78d5676acf7b0c9b5'),
    measurementId: readEnv('VITE_FIREBASE_MEASUREMENT_ID', 'G-2YZVPM5J6J'),
  },
};
