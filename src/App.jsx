import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Cpu,
  Layers,
  Radio,
  ChevronRight,
  Activity,
  Command,
  History,
  GitBranch,
  Binary,
  Shield,
  Zap,
  Rewind,
  FastForward,
} from 'lucide-react';
import { seedLocalAgents } from './engine/ecs';
import { RhizohEngine } from './engine/renderer-three';
import { addLog, logStore, uiStore, worldStore } from './engine/store';
import { appId, auth, firebaseApi, firebaseEnabled, rtdb } from './firebaseRuntime';
import { useStore } from './hooks/useStore';

/**
 * ============================================================================
 * 1. KERNEL & CONFIGURATION [CODEX_DATE: 2025-07-12]
 * ============================================================================
 */
const CODEX_DATE = '2025-07-12';
const CODEX_VERSION = 'v157.0_RHIZOH_PRIME';
const LOCAL_USER = { uid: 'local-dev' };

/**
 * ============================================================================
 * 4. MAIN APPLICATION
 * ============================================================================
 */
export default function App() {
  const containerRef = useRef();
  const engineRef = useRef();
  const [user, setUser] = useState(null);
  const [command, setCommand] = useState('');
  const [chronosOpen, setChronosOpen] = useState(true);
  const authInitRef = useRef(false);

  const world = useStore(worldStore, useCallback((s) => s, []));
  const ui = useStore(uiStore, useCallback((s) => s, []));
  const snapshots = useStore(worldStore, useCallback((s) => s.snapshots, []));
  const flash = useStore(uiStore, useCallback((s) => s.flash, []));
  const logs = useStore(logStore, useCallback((s) => s.logs, []));
  const agentCount = useMemo(() => Object.keys(world.agents).length, [world.agents]);
  const chronosHasSnapshots = snapshots.length > 0;

  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => {
      uiStore.setState((prev) => (prev.flash === flash ? { ...prev, flash: null } : prev));
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

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

    const engine = new RhizohEngine(containerRef.current);
    engineRef.current = engine;
    uiStore.setState((prev) => ({ ...prev, connected: true }));
    addLog(`OTORITE_AKTIF_${CODEX_DATE}`, 'SEC');

    if (!firebaseEnabled) {
      seedLocalAgents();
      engine.invalidate(worldStore.getState().agents);
      return () => {
        engine.dispose();
        engineRef.current = null;
        uiStore.setState((prev) => ({ ...prev, connected: false }));
        addLog('OTORITE_OFFLINE', 'WARN');
      };
    }

    const agentsRef = firebaseApi.ref(rtdb, `artifacts/${appId}/cells/${ui.cellId}/agents`);

    const onAdd = (snap) => {
      if (worldStore.getState().mode !== 'LIVE') return;
      worldStore.setState((prev) => {
        const next = { ...prev.agents, [snap.key]: snap.val() };
        engine.invalidate(next);
        return { ...prev, agents: next, version: prev.version + 1 };
      });
    };

    const onChange = (snap) => {
      if (worldStore.getState().mode !== 'LIVE') return;
      worldStore.setState((prev) => {
        const next = { ...prev.agents, [snap.key]: snap.val() };
        engine.invalidate(next);
        return { ...prev, agents: next, version: prev.version + 1 };
      });
    };

    const onRemove = (snap) => {
      if (worldStore.getState().mode !== 'LIVE') return;
      worldStore.setState((prev) => {
        const next = { ...prev.agents };
        delete next[snap.key];
        engine.invalidate(next);
        return { ...prev, agents: next, version: prev.version + 1 };
      });
    };

    const unsubscribers = [
      firebaseApi.onChildAdded(agentsRef, onAdd),
      firebaseApi.onChildChanged(agentsRef, onChange),
      firebaseApi.onChildRemoved(agentsRef, onRemove),
    ];

    const presenceRef = firebaseApi.ref(rtdb, `presence/${appId}/users/${user.uid}`);
    firebaseApi.onDisconnect(presenceRef).remove();
    firebaseApi.set(presenceRef, { status: 'online', ts: Date.now(), cell: ui.cellId });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
      engine.dispose();
      engineRef.current = null;
      uiStore.setState((prev) => ({ ...prev, connected: false }));
      addLog('OTORITE_OFFLINE', 'WARN');
    };
  }, [user, ui.cellId]);

  const captureSnapshot = useCallback(() => {
    addLog('SNAPSHOT_TRIGGERED', 'USER');
    const current = worldStore.getState();
    const snapshot = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      version: current.version,
      agents: structuredClone(current.agents),
      cell: uiStore.getState().cellId,
    };
    worldStore.setState((prev) => ({
      ...prev,
      snapshots: [snapshot, ...prev.snapshots].slice(0, 10),
    }));
    uiStore.setState((prev) => ({
      ...prev,
      flash: 'snapshot_created',
    }));
    addLog('DUNYA_GORUNTUSU_KAYDEDILDI', 'SEC');
  }, []);

  const setTimeline = useCallback((idx) => {
    const mode = idx === -1 ? 'LIVE' : 'REPLAY';
    const current = worldStore.getState();
    const source = idx === -1 ? current.agents : current.snapshots[idx]?.agents || current.agents;
    worldStore.setState((prev) => ({ ...prev, mode, activeSnapshotIndex: idx }));
    engineRef.current?.invalidate(source);
  }, []);

  const handleExecute = useCallback(() => {
    const cmd = command.trim().toLowerCase();
    if (!cmd) return;
    addLog(`KOMUT_YURUTULUYOR: ${cmd.toUpperCase()}`, 'USER');
    if (cmd === '/snap') captureSnapshot();
    if (cmd === '/live') setTimeline(-1);
    setCommand('');
  }, [captureSnapshot, command, setTimeline]);

  return (
    <div className="h-screen w-full bg-[#010203] text-sky-400 font-mono overflow-hidden relative selection:bg-sky-500/30">
      <div ref={containerRef} className="absolute inset-0 z-0 opacity-80 pointer-events-none" />

      <div className="absolute top-4 left-4 z-10 pointer-events-none space-y-4 lg:top-10 lg:left-10 lg:space-y-6">
        <div className="bg-black/90 backdrop-blur-3xl border border-sky-500/20 p-5 rounded-[2rem] pointer-events-auto shadow-4xl min-w-[300px] lg:p-10 lg:rounded-[3.5rem] lg:min-w-[400px]">
          <div className="flex items-center gap-4 mb-6 lg:gap-6 lg:mb-12">
            <div className="p-4 bg-sky-500/10 rounded-3xl lg:p-5">
              <Shield className="text-sky-400" size={32} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.5em] text-sky-400/30 font-black lg:text-[12px] lg:tracking-[0.8em]">
                Rhizoh_Otoritesi
              </div>
              <div className="text-2xl font-black text-white tracking-tighter lg:text-4xl">{CODEX_VERSION}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:gap-10">
            <div className="bg-white/5 p-5 rounded-[2rem] border border-white/5 lg:p-8 lg:rounded-[2.5rem]">
              <div className="text-[10px] uppercase mb-2 text-sky-500/40 font-black tracking-widest flex items-center gap-2">
                <Activity size={12} /> Zaman_Modu
              </div>
              <div className={`text-xl font-black tracking-widest ${world.mode === 'LIVE' ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`}>
                {world.mode === 'LIVE' ? 'CANLI' : 'TEKRAR'}
              </div>
            </div>
            <div className="bg-white/5 p-5 rounded-[2rem] border border-white/5 lg:p-8 lg:rounded-[2.5rem]">
              <div className="text-[10px] uppercase mb-2 text-sky-500/40 font-black tracking-widest flex items-center gap-2">
                <Layers size={12} /> Delta_Senk
              </div>
              <div className="text-xl font-black text-white tabular-nums">#{world.version}</div>
            </div>
          </div>
        </div>

        <div className="bg-black/80 backdrop-blur-2xl border border-sky-500/10 p-5 rounded-[2rem] w-72 pointer-events-auto lg:p-8 lg:rounded-[3rem] lg:w-80">
          <div className="text-[10px] uppercase tracking-widest text-sky-500/20 mb-4 flex items-center gap-2">
            <Radio size={14} /> Dugum_Telemetrisi
          </div>
          <div className="space-y-2 h-40 overflow-hidden text-[10px]">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-3 opacity-40 hover:opacity-100 transition-opacity">
                <span className="text-sky-500/30">[{log.ts}]</span>
                <span className={log.type === 'ERR' ? 'text-rose-500' : 'text-white/60'}>
                  {String(log.msg)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setChronosOpen((open) => !open)}
        className="absolute top-4 right-4 z-20 rounded-full border border-sky-500/20 bg-black/80 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-sky-400/60 transition-colors hover:text-sky-200 lg:top-10 lg:right-10"
      >
        Chronos_{chronosOpen ? 'Kapat' : 'Ac'}
      </button>

      <div
        className={`absolute top-4 right-4 z-10 space-y-4 transition-all duration-500 lg:top-10 lg:right-10 lg:space-y-6 ${
          chronosOpen ? 'opacity-100' : 'opacity-0 pointer-events-none translate-x-4'
        }`}
      >
        <div
          className={`mt-12 bg-black/90 backdrop-blur-3xl border border-sky-500/10 p-5 rounded-[2rem] w-56 shadow-4xl pointer-events-auto transition-all duration-300 lg:mt-14 lg:p-8 lg:rounded-[3.5rem] lg:w-64 ${
            chronosHasSnapshots ? 'opacity-100' : 'opacity-30'
          }`}
        >
          <div className="text-[9px] uppercase tracking-widest text-sky-500/30 mb-5 flex items-center gap-3 font-black lg:text-[10px] lg:mb-8">
            <span className="flex items-center gap-3">
              <History size={16} /> Chronos_Beslemesi
            </span>
          </div>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto no-scrollbar pr-2">
            <button
              type="button"
              onClick={() => setTimeline(-1)}
              className={`w-full p-5 rounded-3xl text-[11px] flex justify-between items-center cursor-pointer transition-all border ${world.mode === 'LIVE' ? 'bg-sky-500/10 border-sky-500/30 text-white' : 'bg-white/5 border-transparent text-sky-500/40'}`}
            >
              <span>CANLI_MOD</span>
              <Activity size={14} className={world.mode === 'LIVE' ? 'animate-pulse' : ''} />
            </button>
            {!chronosHasSnapshots && (
              <div className="rounded-3xl border border-dashed border-sky-500/10 bg-white/5 p-5 text-[9px] font-black uppercase tracking-widest text-sky-500/40">
                Snapshot_bekleniyor
              </div>
            )}
            {snapshots.map((snapshot, idx) => (
              <button
                type="button"
                key={snapshot.id}
                onClick={() => setTimeline(idx)}
                className={`w-full p-5 rounded-3xl text-[11px] flex flex-col gap-2 cursor-pointer transition-all border ${world.activeSnapshotIndex === idx ? 'bg-amber-500/10 border-amber-500/30 text-white' : 'bg-white/5 border-transparent text-sky-500/40 hover:bg-white/10'}`}
              >
                <div className="flex justify-between font-black">
                  <span>SENK_{snapshot.version}</span>
                  <Binary size={14} />
                </div>
                <div className="text-[9px] opacity-40 italic">
                  {new Date(snapshot.ts).toLocaleTimeString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-6xl px-6 z-20 pointer-events-auto lg:bottom-12 lg:px-12">
        <div className="bg-black/95 backdrop-blur-5xl border border-sky-500/20 rounded-[2.75rem] p-5 flex flex-col gap-5 shadow-4xl ring-1 ring-sky-500/10 lg:rounded-[4.5rem] lg:p-8 lg:gap-8">
          <div className="px-6 py-2 flex items-center gap-6 lg:px-12 lg:gap-10">
            <Rewind size={20} className="text-sky-500/20" />
            <div className="flex-1 h-2 bg-sky-500/5 rounded-full relative group cursor-pointer">
              <div className="absolute inset-0 bg-sky-500/10 rounded-full" />
              {snapshots.map((snapshot, i) => (
                <div
                  key={snapshot.id}
                  className="absolute h-2 w-1 bg-sky-400/20 rounded-full"
                  style={{ left: `${(1 - i / 10) * 100}%` }}
                />
              ))}
              <div
                className="absolute h-6 w-6 bg-sky-400 rounded-full top-1/2 -translate-y-1/2 shadow-[0_0_20px_#0ea5e9] transition-all border-4 border-black"
                style={{ left: world.mode === 'LIVE' ? '100%' : `${(1 - world.activeSnapshotIndex / 10) * 100}%` }}
              />
            </div>
            <FastForward size={20} className="text-sky-500/20" />
          </div>

          <div className="flex items-center gap-5 lg:gap-10">
            <div className="bg-sky-500/10 p-4 rounded-full ml-2 lg:p-6 lg:ml-4">
              <Command size={32} className="text-sky-400 lg:size-10" />
            </div>
            <input
              type="text"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleExecute()}
              placeholder="KOMUT_GIRIS..."
              className="flex-1 bg-transparent border-none outline-none text-sky-50 text-xl font-black tracking-[0.2em] uppercase placeholder:text-sky-900/30 lg:text-3xl lg:tracking-[0.3em]"
            />
            <div className="flex gap-3 pr-2 lg:gap-6 lg:pr-4">
              <button
                type="button"
                onClick={captureSnapshot}
                aria-label="Capture Chronos snapshot"
                title="Capture Chronos snapshot"
                className={`p-6 bg-white/5 border rounded-[2rem] hover:bg-white/10 transition-all text-sky-400/60 disabled:opacity-30 lg:p-10 lg:rounded-[3rem] ${
                  flash === 'snapshot_created'
                    ? 'border-sky-400/80 scale-95 shadow-[0_0_45px_rgba(56,189,248,0.35)]'
                    : 'border-white/10'
                }`}
              >
                <GitBranch size={32} className="lg:size-10" />
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={!ui.connected}
                className="p-7 bg-sky-600 rounded-[2.25rem] hover:bg-sky-400 transition-all active:scale-95 shadow-[0_0_80px_rgba(14,165,233,0.4)] group disabled:opacity-30 lg:p-12 lg:rounded-[3.5rem]"
              >
                <ChevronRight className="text-black group-hover:translate-x-2 transition-transform lg:size-12" size={36} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-between mt-6 px-10 text-[10px] uppercase tracking-[0.6em] font-black text-sky-500/20 items-center lg:mt-12 lg:px-20 lg:text-[11px] lg:tracking-[1em]">
          <div className="flex items-center gap-5">
            <Zap size={16} /> OLCEK: {agentCount} BIRIM
          </div>
          <div
            className={`flex items-center gap-5 ${ui.connected ? 'text-emerald-400/40' : 'text-rose-400/40'}`}
          >
            {firebaseEnabled ? 'FIREBASE_CANLI' : 'LOCAL_CANLI'} <Cpu size={16} />
          </div>
        </div>
      </div>

      {flash === 'snapshot_created' && (
        <div className="fixed bottom-56 left-1/2 z-30 -translate-x-1/2 rounded-full border border-sky-400/50 bg-black/95 px-8 py-4 text-sm font-black uppercase tracking-[0.5em] text-sky-300 shadow-[0_0_60px_rgba(56,189,248,0.55)] animate-pulse lg:bottom-72">
          SNAPSHOT STORED
        </div>
      )}

      {world.mode === 'REPLAY' && (
        <div className="fixed top-32 left-1/2 z-30 -translate-x-1/2 rounded-full border border-amber-400/40 bg-black/90 px-6 py-3 text-[10px] font-black uppercase tracking-[0.5em] text-amber-300 shadow-[0_0_45px_rgba(251,191,36,0.35)]">
          CHRONOS REPLAY ACTIVE
        </div>
      )}

      <style>{`
        .bg-black\\/95 { background-color: rgba(1, 2, 3, 0.95); }
        .backdrop-blur-5xl { backdrop-filter: blur(60px); }
        input::placeholder { font-weight: 900; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        body { background: #010203; }
      `}</style>
    </div>
  );
}
