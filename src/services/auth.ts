import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebase';
import type { UserIdentity } from '../types/domain';
export const signInRuntimeUser = async (): Promise<UserIdentity> => { const credential = await signInAnonymously(auth); return { uid: credential.user.uid }; };
