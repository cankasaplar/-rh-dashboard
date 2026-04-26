import { useEffect } from 'react';
import { nodesStore, uiStore } from '../core/ECSStore';
import { SovereignEngine } from '../core/Engine';
import { signInRuntimeUser } from '../services/auth';
import { subscribeGhostPets, subscribeMemoryShards, subscribeNodes, type Unsubscribe } from '../services/firestore';
import { startPresenceHeartbeat } from '../services/rtdb';
import { telemetryBus } from '../core/telemetryBus';
export const useRuntime = (container: HTMLElement | null) => {
  useEffect(() => {
    if (!container) return undefined; const engine = new SovereignEngine(container); let active = true; let cleanupPresence: (() => void) | null = null; let subscriptions: Unsubscribe[] = [];
    const unsubscribeNodesStore = nodesStore.subscribe(() => { const { nodes, isDirty } = nodesStore.getState(); if (!isDirty) return; engine.updateNodes(nodes); nodesStore.setState((state) => ({ ...state, isDirty: false })); });
    const boot = async () => { try { const user = await signInRuntimeUser(); if (!active) return; uiStore.setState((state) => ({ ...state, connected: true })); telemetryBus.security(`SEC: Identity Mapped [${user.uid.slice(0, 6)}]`); subscriptions = [subscribeNodes(uiStore.getState().currentCell), subscribeGhostPets(user.uid), subscribeMemoryShards()]; cleanupPresence = startPresenceHeartbeat(user.uid); } catch (error) { telemetryBus.critical(`BOOT_FAIL: ${error instanceof Error ? error.message : 'unknown error'}`); } };
    void boot();
    return () => { active = false; subscriptions.forEach((unsubscribe) => unsubscribe()); unsubscribeNodesStore(); cleanupPresence?.(); uiStore.setState((state) => ({ ...state, connected: false })); engine.terminate(); };
  }, [container]);
};
