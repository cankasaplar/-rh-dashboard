import { logStore } from '../core/ECSStore';
const MAX_LOGS = 12;
export const addLog = (msg: string, type = 'SYS') => { logStore.setState((state) => ({ logs: [{ ts: new Date().toLocaleTimeString(), type, msg, id: crypto.randomUUID() }, ...state.logs].slice(0, MAX_LOGS) })); };
