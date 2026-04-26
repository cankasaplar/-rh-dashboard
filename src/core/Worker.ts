import type { NodeRecord } from '../types/domain';
type Message = { type: 'SYNC_WORLD'; nodes: Record<string, NodeRecord> };
self.onmessage = (event: MessageEvent<Message>) => { if (event.data.type !== 'SYNC_WORLD') return; self.postMessage({ type: 'WORLD_TICK', nodes: event.data.nodes, ts: performance.now() }); };
export {};
