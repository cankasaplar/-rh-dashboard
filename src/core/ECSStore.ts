import { createStore } from './store';
import type { LogState, NodesState, OpsState, Snapshot, UIState, WorldState } from '../types/domain';
export const nodesStore = createStore<NodesState>({ nodes: {}, isDirty: false });
export const worldStore = createStore<WorldState>({ ghostPets: {}, memoryShards: [], snapshots: [], activeSnapshotId: null, mode: 'LIVE', version: 0 });
export const opsStore = createStore<OpsState>({ latency: 0, cellLoad: 0, heartbeatDrift: 0, renderLoad: 0, costIndex: 0, readsCount: 0, writesCount: 0, lastCheck: Date.now() });
export const uiStore = createStore<UIState>({ currentCell: 'c_410_290', connected: false, processing: false, globalSpike: false, activeLayer: 'NODES' });
export const logStore = createStore<LogState>({ logs: [] });
export const markNodesDirty = (nodes: NodesState['nodes']) => { nodesStore.setState({ nodes, isDirty: true }); worldStore.setState((state) => ({ ...state, version: state.version + 1 })); };
export const captureSnapshot = (label = 'Manual snapshot'): Snapshot => {
  const snapshot: Snapshot = { id: crypto.randomUUID(), ts: Date.now(), label, cellId: uiStore.getState().currentCell, nodes: structuredClone(nodesStore.getState().nodes) };
  worldStore.setState((state) => ({ ...state, snapshots: [snapshot, ...state.snapshots].slice(0, 12), activeSnapshotId: snapshot.id, mode: 'REPLAY' }));
  nodesStore.setState({ nodes: snapshot.nodes, isDirty: true });
  return snapshot;
};
export const replaySnapshot = (snapshotId: string | null) => {
  if (snapshotId === null) { worldStore.setState((state) => ({ ...state, activeSnapshotId: null, mode: 'LIVE' })); return; }
  const snapshot = worldStore.getState().snapshots.find((item) => item.id === snapshotId); if (!snapshot) return;
  worldStore.setState((state) => ({ ...state, activeSnapshotId: snapshotId, mode: 'REPLAY' })); nodesStore.setState({ nodes: snapshot.nodes, isDirty: true });
};
