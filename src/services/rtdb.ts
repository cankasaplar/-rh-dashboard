import { off, onDisconnect, ref, remove, set } from 'firebase/database';
import { rtdb } from './firebase';
import { opsStore, uiStore } from '../core/ECSStore';
import { runtimeEnv } from '../utils/env';
export const startPresenceHeartbeat = (uid: string) => {
  const presenceRef = ref(rtdb, `presence/${runtimeEnv.appId}/users/${uid}`); let disposed = false;
  const pulse = () => { if (disposed) return; const now = Date.now(); set(presenceRef, { status: 'online', lastSeen: now, cellId: uiStore.getState().currentCell }); opsStore.setState((state) => ({ ...state, heartbeatDrift: now - state.lastCheck, lastCheck: now, writesCount: state.writesCount + 1 })); };
  pulse(); const timer = window.setInterval(pulse, 15000); onDisconnect(presenceRef).remove();
  return () => { disposed = true; window.clearInterval(timer); remove(presenceRef); off(presenceRef); };
};
