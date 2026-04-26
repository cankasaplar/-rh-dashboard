export const createStore = (initialState) => {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setState: (updater) => {
      const nextState = typeof updater === 'function' ? updater(state) : updater;
      if (nextState !== state) {
        state = nextState;
        listeners.forEach((listener) => listener());
      }
    },
  };
};

export const worldStore = createStore({
  agents: Object.create(null),
  version: 0,
  mode: 'LIVE',
  snapshots: [],
  activeSnapshotIndex: -1,
});
export const uiStore = createStore({ connected: false, cellId: 'c_alpha', processing: false });
export const logStore = createStore({ logs: [] });

export const addLog = (msg, type = 'SYS') => {
  const message = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
  logStore.setState((prev) => ({
    logs: [
      { ts: new Date().toLocaleTimeString(), type, msg: message, id: crypto.randomUUID() },
      ...prev.logs,
    ].slice(0, 12),
  }));
};
