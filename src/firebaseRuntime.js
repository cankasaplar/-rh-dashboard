import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getDatabase,
  ref,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  off,
  set,
  onDisconnect,
} from 'firebase/database';

const parseFirebaseConfig = () => {
  const rawCanvasConfig = globalThis.__firebase_config;
  const rawEnvConfig = import.meta.env.VITE_FIREBASE_CONFIG;

  if (rawCanvasConfig) {
    return JSON.parse(rawCanvasConfig);
  }

  if (rawEnvConfig) {
    return JSON.parse(rawEnvConfig);
  }

  return null;
};

const firebaseConfig = parseFirebaseConfig();
export const app = firebaseConfig
  ? getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp()
  : null;

export const firebaseEnabled = Boolean(app);
export const hasFirebaseConfig = firebaseEnabled;
export const auth = app ? getAuth(app) : null;
export const rtdb = app ? getDatabase(app) : null;

export const firebaseApi = {
  signInAnonymously,
  onAuthStateChanged,
  ref,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  off,
  set,
  onDisconnect,
};

export const getAppId = () => {
  const rawAppId = typeof globalThis.__app_id !== 'undefined'
    ? globalThis.__app_id
    : import.meta.env.VITE_APP_ID || 'castle-genesis';

  return rawAppId.replace(/[.#$[\]]/g, '_');
};

export const appId = getAppId();
