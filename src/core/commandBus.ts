import { captureSnapshot, replaySnapshot, uiStore } from './ECSStore';
import { telemetryBus } from './telemetryBus';
import { resolveCausalAction } from '../services/functions';
export type CommandResult = { handled: boolean; message: string };
export const executeCommand = async (rawCommand: string): Promise<CommandResult> => {
  const command = rawCommand.trim(); if (!command) return { handled: false, message: 'Empty command.' }; telemetryBus.info(`INTENT: ${command.toUpperCase()}`);
  if (command === '/snap') { const snapshot = captureSnapshot('Command snapshot'); telemetryBus.security(`SNAPSHOT_READY: ${snapshot.id.slice(0, 8)}`); return { handled: true, message: 'Snapshot captured.' }; }
  if (command === '/live') { replaySnapshot(null); telemetryBus.security('CHRONOS_LIVE_RESTORED'); return { handled: true, message: 'Live mode restored.' }; }
  if (command.startsWith('/layer ')) { const layer = command.split(' ')[1]?.toUpperCase(); if (layer === 'NODES' || layer === 'CODEX' || layer === 'GHOSTS' || layer === 'CHRONOS') { uiStore.setState((state) => ({ ...state, activeLayer: layer })); return { handled: true, message: `Layer set to ${layer}.` }; } }
  const status = await resolveCausalAction(command); telemetryBus.info(`RESOLVE: ${status}`); return { handled: true, message: status };
};
