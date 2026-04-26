import { describe, expect, it } from 'vitest';
import { createStore } from './store';
describe('createStore', () => { it('notifies subscribers when state changes', () => { const store = createStore({ count: 0 }); let calls = 0; const unsubscribe = store.subscribe(() => { calls += 1; }); store.setState((state) => ({ count: state.count + 1 })); unsubscribe(); store.setState((state) => ({ count: state.count + 1 })); expect(store.getState().count).toBe(2); expect(calls).toBe(1); }); });
