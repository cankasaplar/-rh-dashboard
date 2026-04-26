export type Store<T> = { getState: () => T; subscribe: (cb: () => void) => () => void; setState: (updater: T | ((state: T) => T)) => void };
export const createStore = <T>(initialState: T): Store<T> => {
  let state = initialState; const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    setState: (updater) => { const nextState = typeof updater === 'function' ? (updater as (state: T) => T)(state) : updater; if (!Object.is(nextState, state)) { state = nextState; listeners.forEach((listener) => listener()); } },
  };
};
