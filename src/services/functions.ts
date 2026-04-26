import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { uiStore } from '../core/ECSStore';
type CausalResult = { status?: string };
export const resolveCausalAction = async (intent: string) => { const callable = httpsCallable<{ intent: string; cellId: string }, CausalResult>(functions, 'resolveCausalAction'); const result = await callable({ intent, cellId: uiStore.getState().currentCell }); return result.data.status || 'Complete'; };
