import { useSyncExternalStore } from 'react';

export const useStore = (store, selector) =>
  useSyncExternalStore(store.subscribe, () => selector(store.getState()));
