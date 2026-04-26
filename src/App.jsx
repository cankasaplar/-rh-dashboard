import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Cpu,
  ChevronRight,
  Activity,
  Command,
  RefreshCcw,
} from 'lucide-react';
import { seedLocalAgents } from './engine/ecs';
import { CausalEngine } from './engine/renderer-three';
import { addLog, logStore, uiStore, worldStore } from './engine/store';
import { appId, auth, firebaseApi, firebaseEnabled, rtdb } from './firebaseRuntime';
import { useStore } from './hooks/useStore';

/**
 * ============================================================================
 * 1. KERNEL & CONFIGURATION [CODEX_DATE: 2025-07-12]
 * ============================================================================
 */
const CODEX_DATE = '2025-07-12';
const CODEX_VERSION = 'v154.0_AUTHORITY';
const LOCAL_USER = { uid: 'local-dev' };

/**
 * ============================================================================
 * 4. MAIN APPLICATION
 * ============================================================================
 */
export default function App() {
  const containerRef = useRef();
  const engineRef = useRef();
  const commandInputRef = useRef();
  const [user, setUser] = useState(null);
  const [command, setCommand] = useState('');
  const authInitRef = useRef(false);

  const selectCell = useCallback((s) => s.cellId, []);
  const selectConnected = useCallback((s) => s.connected, []);
  const selectLogs = useCallback((s) => s.logs, []);
  const selectVersion = useCallback((s) => s.version, []);
  const selectProcessing = useCallback((s) => s.processing, []);

  const cellId = useStore(uiStore, selectCell);
  const connected = useStore(uiStore, selectConnected);
  const logs = useStore(logStore, selectLogs);
  const worldVersion = useStore(worldStore, selectVersion);
  const processing = useStore(uiStore, selectProcessing);

  const latestLog = logs[0];
  const agentCount = useStore(worldStore, (s) => s.agents.size);

  useEffect(() => {
    if (authInitRef.current) return undefined;
    authInitRef.current = true;

    if (!firebaseEnabled) {
      setUser(LOCAL_USER);
      addLog('LOCAL_FIREBASE_FALLBACK', 'WARN');
      return undefined;
    }

    const unsubAuth = firebaseApi.onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) setUser(firebaseUser);
      else firebaseApi.signInAnonymously(auth).catch(() => addLog('AUTH_FAILURE', 'ERR'));
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!containerRef.current || !user) return undefined;

    const engine = new CausalEngine(containerRef.current, worldStore);
    engineRef.current = engine;
    uiStore.setState((prev) => ({ ...prev, connected: true }));
    addLog(`BOOTING_CODEX_${CODEX_DATE}`, 'SEC');

    if (!firebaseEnabled) {
      seedLocalAgents();
      engine.invalidate();
      return () => {
        engine.dispose();
        engineRef.current = null;
        uiStore.setState((prev) => ({ ...prev, connected: false }));
        addLog('CAUSAL_OFFLINE', 'WARN');
      };
    }

    const agentsRef = firebaseApi.ref(rtdb, `artifacts/${appId}/cells/${cellId}/agents`);

    const onAdd = (snap) => {
      worldStore.setState((prev) => {
        const next = new Map(prev.agents);
        next.set(snap.key, snap.val());
        return { ...prev, agents: next, version: prev.version + 1 };
      });
      engine.invalidate();
    };

    const onChange = (snap) => {
      worldStore.setState((prev) => {
        const next = new Map(prev.agents);
        next.set(snap.key, snap.val());
        return { ...prev, agents: next, version: prev.version + 1 };
      });
      engine.invalidate();
    };

    const onRemove = (snap) => {
      worldStore.setState((prev) => {
        const next = new Map(prev.agents);
        next.delete(snap.key);
        return { ...prev, agents: next, version: prev.version + 1 };
      });
      engine.invalidate();
    };

    const unsubscribers = [
      firebaseApi.onChildAdded(agentsRef, onAdd),
      firebaseApi.onChildChanged(agentsRef, onChange),
      firebaseApi.onChildRemoved(agentsRef, onRemove),
    ];

    const presenceRef = firebaseApi.ref(rtdb, `presence/${appId}/users/${user.uid}`);
    firebaseApi.onDisconnect(presenceRef).remove();
    firebaseApi.set(presenceRef, { status: 'online', ts: Date.now(), cell: cellId });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
      engine.dispose();
      engineRef.current = null;
      uiStore.setState((prev) => ({ ...prev, connected: false }));
      addLog('CAUSAL_OFFLINE', 'WARN');
    };
  }, [user, cellId]);

  const handleCommand = () => {
    if (!command.trim() || processing) return;
    uiStore.setState((prev) => ({ ...prev, processing: true }));
    addLog(`EXEC: ${command.toUpperCase()}`, 'USER');

    setTimeout(() => {
      setCommand('');
      commandInputRef.current?.blur();
      uiStore.setState((prev) => ({ ...prev, processing: false }));
      addLog('ACTION_SYNCED', 'SEC');
    }, 800);
  };

  return (
    <div className="h-screen w-full bg-[#010204] text-sky-400 font-mono overflow-hidden relative selection:bg-sky-500/30">
      <div ref={containerRef} className="absolute inset-0 z-0 opacity-60 pointer-events-none" />

      <div className="absolute top-8 left-8 z-10 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-3xl border border-sky-500/20 p-8 rounded-[2.5rem] pointer-events-auto shadow-4xl group transition-all hover:border-sky-500/40">
          <div className="flex items-center gap-6 mb-8">
            <div className="p-4 bg-sky-500/10 rounded-2xl group-hover:bg-sky-500/20 transition-all">
              <Sparkles className="text-sky-400 animate-pulse" size={24} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.5em] text-sky-400/30 font-black">
                Causal_Authority
              </div>
              <div className="text-2xl font-black text-white tracking-tighter">{CODEX_VERSION}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white/5 p-5 rounded-2xl border border-white/5 shadow-inner">
              <div className="text-[9px] uppercase mb-1 text-sky-500/40 font-black tracking-widest">
                Cell_Identity
              </div>
              <div className="text-lg font-black text-white tracking-widest">{cellId.toUpperCase()}</div>
            </div>
            <div className="bg-white/5 p-5 rounded-2xl border border-white/5 shadow-inner">
              <div className="text-[9px] uppercase mb-1 text-sky-500/40 font-black tracking-widest">
                Delta_Sync
              </div>
              <div className="text-lg font-black text-emerald-400 tabular-nums">#{worldVersion}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-4xl px-8 z-20">
        <div className="bg-black/95 backdrop-blur-4xl border border-sky-500/20 rounded-[3.5rem] p-4 flex items-center gap-6 shadow-4xl ring-1 ring-sky-500/10 focus-within:ring-sky-500/40 focus-within:border-sky-500/50 transition-all">
          <div className="bg-sky-500/10 p-5 rounded-full ml-2">
            <Command size={28} className={processing ? 'animate-spin text-sky-400' : 'text-sky-400'} />
          </div>
          <input
            ref={commandInputRef}
            type="text"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleCommand()}
            placeholder="ENTER_CAUSAL_COMMAND..."
            className="flex-1 bg-transparent border-none outline-none text-sky-50 text-xl font-black tracking-[0.2em] uppercase placeholder:text-sky-900/30"
          />
          <button
            onClick={handleCommand}
            disabled={processing || !connected}
            className="p-8 bg-sky-600 rounded-[2.5rem] hover:bg-sky-400 transition-all active:scale-95 shadow-[0_0_50px_rgba(14,165,233,0.3)] disabled:opacity-30 group"
          >
            {processing ? (
              <RefreshCcw className="animate-spin text-black" size={32} />
            ) : (
              <ChevronRight className="text-black group-hover:translate-x-1 transition-transform" size={32} />
            )}
          </button>
        </div>

        <div className="flex justify-between mt-8 px-14 text-[10px] uppercase tracking-[0.6em] font-black text-sky-500/20 items-center">
          <div className="flex items-center gap-4">
            <Activity size={14} /> LOAD: {agentCount} UNITS
          </div>
          <div className="flex items-center gap-4 bg-sky-500/5 px-4 py-2 rounded-full border border-sky-500/10 min-w-[200px] justify-center">
            {latestLog ? (
              <span className={latestLog.type === 'ERR' ? 'text-rose-500' : 'text-sky-400/50'}>
                {String(latestLog.msg)}
              </span>
            ) : (
              'CORE_IDLE'
            )}
          </div>
          <div className="flex items-center gap-4">
            STABLE_RUNTIME <Cpu size={14} />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.3)_50%),linear-gradient(90deg,rgba(255,0,0,0.05),rgba(0,255,0,0.02),rgba(0,0,255,0.05))] bg-[length:100%_4px,4px_100%]" />
    </div>
  );
}
