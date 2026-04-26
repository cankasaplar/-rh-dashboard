import { useSyncExternalStore } from 'react';
import type { Store } from '../core/store';
export const useStore = <T, Selected>(store: Store<T>, selector: (state: T) => Selected): Selected => useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
