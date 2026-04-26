import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { firestore } from './firebase';
import { markNodesDirty, opsStore, worldStore } from '../core/ECSStore';
import { telemetryBus } from '../core/telemetryBus';
import { runtimeEnv } from '../utils/env';
import type { MemoryShard, NodeRecord } from '../types/domain';
export type Unsubscribe = () => void;
export const subscribeNodes = (cellId: string): Unsubscribe => {
  const nodesQ = query(collection(firestore, 'artifacts', runtimeEnv.appId, 'cells', cellId, 'nodes'), limit(300));
  return onSnapshot(nodesQ, (snap) => { const batch: Record<string, NodeRecord> = {}; snap.forEach((item) => { batch[item.id] = item.data() as NodeRecord; }); markNodesDirty(batch); opsStore.setState((state) => ({ ...state, cellLoad: snap.size, readsCount: state.readsCount + snap.size })); });
};
export const subscribeGhostPets = (uid: string): Unsubscribe => {
  const petsQ = query(collection(firestore, 'ghostPetProgress'), where('userId', '==', uid), orderBy('totalInteractions', 'desc'), limit(5));
  return onSnapshot(petsQ, (snap) => { const ghostPets: Record<string, { totalInteractions?: number; name?: string; stage?: string }> = {}; snap.forEach((item) => { ghostPets[item.id] = item.data(); }); worldStore.setState((state) => ({ ...state, ghostPets })); telemetryBus.world('GHOST: Evolution data synchronized.'); });
};
export const subscribeMemoryShards = (): Unsubscribe => {
  const shardsQ = query(collection(firestore, 'memoryShards'), where('tags', 'array-contains', `codex-${runtimeEnv.codexAnchor}`), orderBy('createdAt', 'desc'), limit(10));
  return onSnapshot(shardsQ, (snap) => { const memoryShards: MemoryShard[] = []; snap.forEach((item) => memoryShards.push({ id: item.id, ...item.data() } as MemoryShard)); worldStore.setState((state) => ({ ...state, memoryShards })); });
};
