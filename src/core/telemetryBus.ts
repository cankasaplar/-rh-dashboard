import { addLog } from '../utils/logger';
export const telemetryBus = { info: (msg: string) => addLog(msg, 'SYS'), security: (msg: string) => addLog(msg, 'SEC'), world: (msg: string) => addLog(msg, 'WORLD'), critical: (msg: string) => addLog(msg, 'CRITICAL') };
