import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeCommand } from './commandBus';
import { nodesStore, replaySnapshot, worldStore } from './ECSStore';
vi.mock('../services/functions', () => ({ resolveCausalAction: vi.fn(async () => 'mock causal completion') }));
beforeEach(() => { nodesStore.setState({ nodes: { n1: { pos: { lat: 41, lng: 29 }, resonance: 0.8 } }, isDirty: false }); worldStore.setState({ ghostPets: {}, memoryShards: [], snapshots: [], activeSnapshotId: null, mode: 'LIVE', version: 0 }); });
describe('executeCommand', () => { it('captures and replays snapshots through the command bus', async () => { await executeCommand('/snap'); const [snapshot] = worldStore.getState().snapshots; expect(snapshot.nodes.n1.resonance).toBe(0.8); expect(worldStore.getState().mode).toBe('REPLAY'); replaySnapshot(null); expect(worldStore.getState().mode).toBe('LIVE'); }); it('routes unknown intents through the functions gateway', async () => { const result = await executeCommand('boost portal'); expect(result.message).toBe('mock causal completion'); }); });
