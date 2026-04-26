import React, { useState, useRef, useEffect, useSyncExternalStore, useCallback } from 'react';
import * as THREE from 'three';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot } from 'firebase/firestore';
import { getDatabase, ref, onChildAdded, onChildChanged, onChildRemoved, set, onDisconnect, off } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  BookOpen,
  ChevronRight,
  Cpu,
  Layers,
  Radio,
  RefreshCcw,
  Sparkles,
  Terminal,
} from 'lucide-react';

const CODEX_VERSION = 'v149.2-PATH-SANITY';
const REGION = 'europe-west3';
const CODEX_DATE = '2025-07-12';

const safeJsonParse = (raw) => {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error('FIREBASE_CONFIG_PARSE_FAIL:', err);
    return null;
  }
};

const firebaseConfig = safeJsonParse(globalThis.__firebase_config || import.meta.env.VITE_FIREBASE_CONFIG);
const rawAppId = typeof globalThis.__app_id !== 'undefined'
  ? globalThis.__app_id
  : import.meta.env.VITE_APP_ID || 'castle-genesis';
const appId = String(rawAppId).replace(/[.#$[\]]/g, '_');

let app = null;
let db = null;
let auth = null;
let rtdb = null;
let functions = null;

try {
  if (firebaseConfig) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    rtdb = getDatabase(app);
    functions = getFunctions(app, REGION);
  } else {
    console.warn('FIREBASE_CONFIG_MISSING: Set VITE_FIREBASE_CONFIG or window.__firebase_config.');
  }
} catch (err) {
  console.error('CAUSAL_INIT_FATAL:', err);
}

const createStore = (initialState) => {
  let state = initialState;
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    mutateAgents: (id, data, action) => {
      if (action === 'set') state.agents.set(id, data);
      else if (action === 'delete') state.agents.delete(id);
      state.agentVersion += 1;
      listeners.forEach((listener) => listener());
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

const worldStore = createStore({
  agents: new Map(),
  agentVersion: 0,
  memoryShards: [],
  protests: [],
  renderQuality: 1.0,
  gpuTier: 'unknown',
  fps: 60,
  codexSync: 0,
});

const uiStore = createStore({
  connected: false,
  processing: false,
  currentCell: 'c_alpha_sim',
  userId: null,
});

const logStore = createStore({ logs: [] });
const addLog = (msg, type = 'SYS') => {
  logStore.setState((state) => ({
    logs: [{
      ts: new Date().toLocaleTimeString(),
      type,
      msg,
      id: crypto.randomUUID(),
    }, ...state.logs].slice(0, 10),
  }));
};

class CausalEngine {
  constructor(container) {
    this.container = container;
    this.disposed = false;
    this.rafId = null;
    this.frames = 0;
    this.lastFpsUpdate = 0;
    this.needsSync = false;
    this.resizeObserver = null;

    this.dummy = new THREE.Object3D();
    this.tempUp = new THREE.Vector3(0, 0, 1);
    this.tempPos = new THREE.Vector3();
    this.tempNormal = new THREE.Vector3();
    this.instanceMap = new Map();
    this.freeSlots = [];
    this.nextIdx = 0;
    this.maxSlots = 5000;

    this.profileHardware();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 60000);
    this.camera.position.set(0, 0, 15000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.container.appendChild(this.renderer.domElement);

    this.setupWorld();
    this.setupResize();
    this.animate(0);
  }

  profileHardware() {
    const memory = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;
    const tier = memory > 4 && cores > 4 ? 'high' : (memory > 2 ? 'medium' : 'low');
    worldStore.setState((state) => ({
      ...state,
      gpuTier: tier,
      renderQuality: tier === 'high' ? 1.0 : (tier === 'medium' ? 0.7 : 0.4),
    }));
  }

  setupWorld() {
    this.globeGeo = new THREE.SphereGeometry(3500, 32, 32);
    this.globeMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, wireframe: true, transparent: true, opacity: 0.1 });
    this.globe = new THREE.Mesh(this.globeGeo, this.globeMat);
    this.scene.add(this.globe);

    this.coreGeo = new THREE.SphereGeometry(250, 24, 24);
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.4 });
    this.core = new THREE.Mesh(this.coreGeo, this.coreMat);
    this.scene.add(this.core);

    this.agentGeo = new THREE.ConeGeometry(30, 80, 4).rotateX(Math.PI / 2);
    this.agentMat = new THREE.MeshPhongMaterial({ color: 0xf43f5e, emissive: 0x9f1239 });
    this.agentMesh = new THREE.InstancedMesh(this.agentGeo, this.agentMat, this.maxSlots);
    this.scene.add(this.agentMesh, new THREE.PointLight(0xffffff, 1, 25000));
    this.scene.add(new THREE.AmbientLight(0x202020));
  }

  setupResize() {
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (this.disposed || !entry) return;
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
    this.resizeObserver.observe(this.container);
  }

  syncAgents(agentsMap) {
    if (this.disposed || !agentsMap) return;

    this.instanceMap.forEach((slotIdx, id) => {
      if (!agentsMap.has(id)) {
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.agentMesh.setMatrixAt(slotIdx, this.dummy.matrix);
        this.freeSlots.push(slotIdx);
        this.instanceMap.delete(id);
      }
    });

    agentsMap.forEach((agent, id) => {
      if (!agent.pos) return;
      const slotIdx = this.instanceMap.has(id) ? this.instanceMap.get(id) : (this.freeSlots.pop() ?? this.nextIdx++);
      if (slotIdx >= this.maxSlots) return;
      this.instanceMap.set(id, slotIdx);

      const phi = (90 - agent.pos.lat) * (Math.PI / 180);
      const theta = (agent.pos.lng + 180) * (Math.PI / 180);

      this.tempPos.set(
        -3510 * Math.sin(phi) * Math.cos(theta),
        3510 * Math.cos(phi),
        3510 * Math.sin(phi) * Math.sin(theta),
      );

      this.dummy.position.copy(this.tempPos);
      this.tempNormal.copy(this.tempPos).normalize();
      this.dummy.quaternion.setFromUnitVectors(this.tempUp, this.tempNormal);

      const quality = worldStore.getState().renderQuality;
      this.dummy.scale.set(quality, quality, quality);
      this.dummy.updateMatrix();
      this.agentMesh.setMatrixAt(slotIdx, this.dummy.matrix);
    });

    this.agentMesh.instanceMatrix.needsUpdate = true;
  }

  animate(time) {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame((frameTime) => this.animate(frameTime));

    this.globe.rotation.y += 0.0002;
    this.core.scale.setScalar(1 + Math.sin(time * 0.003) * 0.15);

    if (this.needsSync) {
      this.syncAgents(worldStore.getState().agents);
      this.needsSync = false;
    }

    this.renderer.render(this.scene, this.camera);

    this.frames += 1;
    if (time > this.lastFpsUpdate + 1000) {
      const fps = Math.round((this.frames * 1000) / (time - this.lastFpsUpdate));
      worldStore.setState((state) => ({ ...state, fps }));
      this.frames = 0;
      this.lastFpsUpdate = time;
    }
  }

  terminate() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.globeGeo?.dispose();
    this.globeMat?.dispose();
    this.coreGeo?.dispose();
    this.coreMat?.dispose();
    this.agentGeo?.dispose();
    this.agentMat?.dispose();
    this.renderer?.dispose();
    this.scene?.clear();
    if (this.container?.contains(this.renderer?.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

export default function App() {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const [command, setCommand] = useState('');
  const [user, setUser] = useState(null);
  const activeTokenRef = useRef(null);
  const cleanupRef = useRef(null);
  const hasBootedRef = useRef(false);
  const lastTelemetryRef = useRef({ fps: 0, quality: 0, agents: 0 });

  const ui = useSyncExternalStore(uiStore.subscribe, uiStore.getState);
  const world = useSyncExternalStore(worldStore.subscribe, worldStore.getState);
  const logs = useSyncExternalStore(logStore.subscribe, logStore.getState);

  const startTrinityStreaming = useCallback((uid, token) => {
    if (!db || !rtdb) return () => {};

    const shardsCol = collection(db, 'artifacts', appId, 'public', 'data', 'memoryShards');
    const protestsCol = collection(db, 'artifacts', appId, 'public', 'data', 'protests');

    const unsubShards = onSnapshot(shardsCol, (snap) => {
      if (activeTokenRef.current !== token) return;
      const filtered = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((shard) => shard.tags?.includes(`codex-${CODEX_DATE}`));

      worldStore.setState((state) => ({
        ...state,
        memoryShards: filtered.slice(0, 15),
        codexSync: Math.min(100, state.codexSync + 8),
      }));
    }, () => addLog('VERI_AKIS_HATASI', 'ERR'));

    const unsubProtests = onSnapshot(protestsCol, (snap) => {
      if (activeTokenRef.current !== token) return;
      const filtered = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((protest) => protest.status === 'active');

      worldStore.setState((state) => ({ ...state, protests: filtered.slice(0, 5) }));
    });

    const agentsRef = ref(rtdb, `artifacts/${appId}/cells/${uiStore.getState().currentCell}/agents`);
    const markDirty = () => {
      if (engineRef.current) engineRef.current.needsSync = true;
    };

    const handleAdd = (snap) => {
      if (activeTokenRef.current !== token) return;
      worldStore.mutateAgents(snap.key, snap.val(), 'set');
      markDirty();
    };
    const handleUpdate = (snap) => {
      if (activeTokenRef.current !== token) return;
      worldStore.mutateAgents(snap.key, snap.val(), 'set');
      markDirty();
    };
    const handleRemove = (snap) => {
      if (activeTokenRef.current !== token) return;
      worldStore.mutateAgents(snap.key, null, 'delete');
      markDirty();
    };

    onChildAdded(agentsRef, handleAdd);
    onChildChanged(agentsRef, handleUpdate);
    onChildRemoved(agentsRef, handleRemove);

    return () => {
      unsubShards();
      unsubProtests();
      off(agentsRef, 'child_added', handleAdd);
      off(agentsRef, 'child_changed', handleUpdate);
      off(agentsRef, 'child_removed', handleRemove);
    };
  }, []);

  useEffect(() => {
    if (!auth) {
      addLog('FIREBASE_CONFIG_BEKLENIYOR', 'WARN');
      return undefined;
    }

    const initAuth = async () => {
      try {
        const initialToken = globalThis.__initial_auth_token || import.meta.env.VITE_INITIAL_AUTH_TOKEN;
        if (initialToken) {
          await signInWithCustomToken(auth, initialToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('AUTH_FAIL:', err);
        addLog('KIMLIK_HATASI', 'ERR');
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!containerRef.current || engineRef.current) return undefined;

    engineRef.current = new CausalEngine(containerRef.current);

    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!db || !rtdb || !user || hasBootedRef.current) return undefined;

    const boot = async () => {
      hasBootedRef.current = true;
      const token = crypto.randomUUID();
      activeTokenRef.current = token;

      uiStore.setState((state) => ({ ...state, connected: true, userId: user.uid }));
      addLog(`CAUSAL_SISTEM_AKTIF: ${CODEX_DATE}`, 'SEC');

      const streamCleanup = startTrinityStreaming(user.uid, token);
      const presenceRef = ref(rtdb, `presence/${appId}/users/${user.uid}`);
      const telemetryRef = ref(rtdb, `telemetry/${appId}/${user.uid}`);

      try {
        await onDisconnect(presenceRef).remove();
        await onDisconnect(telemetryRef).remove();
      } catch (err) {
        console.warn('DISCONNECT_HOOK_FAIL:', err);
      }

      const pulse = setInterval(() => {
        const state = worldStore.getState();
        const prev = lastTelemetryRef.current;

        set(presenceRef, { status: 'online', ts: Date.now(), cellId: uiStore.getState().currentCell });

        if (Math.abs(state.fps - prev.fps) > 5 || state.agents.size !== prev.agents) {
          set(telemetryRef, {
            fps: state.fps,
            quality: state.renderQuality,
            agents: state.agents.size,
            ts: Date.now(),
          });
          lastTelemetryRef.current = { fps: state.fps, quality: state.renderQuality, agents: state.agents.size };
        }
      }, 20000);

      cleanupRef.current = () => {
        streamCleanup();
        clearInterval(pulse);
      };
    };

    boot();

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [user, startTrinityStreaming]);

  const handleExecute = async () => {
    const sanitizedCmd = command.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!sanitizedCmd || ui.processing) return;

    uiStore.setState((state) => ({ ...state, processing: true }));
    addLog(`CAUSAL_KOMUT: ${sanitizedCmd}`, 'USER');

    try {
      if (!functions) throw new Error('Firebase functions unavailable');
      const fn = httpsCallable(functions, 'resolveCausalAction');
      await fn({
        command: sanitizedCmd,
        cellId: ui.currentCell,
        version: CODEX_VERSION,
        timestamp: CODEX_DATE,
      });
    } catch (err) {
      console.warn('COMMAND_REJECTED:', err);
      addLog('KOMUT_REDDEDILDI', 'WARN');
    } finally {
      setCommand('');
      uiStore.setState((state) => ({ ...state, processing: false }));
    }
  };

  return (
    <div className="gate-shell h-screen w-full bg-[#010204] text-sky-400 font-mono overflow-hidden relative selection:bg-sky-500/30">
      <div ref={containerRef} className="absolute inset-0 z-0 opacity-40" />

      <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start z-10 pointer-events-none">
        <div className="space-y-4">
          <div className="bg-black/90 backdrop-blur-3xl border border-sky-500/20 p-8 rounded-[2.5rem] pointer-events-auto shadow-4xl transition-all hover:border-sky-500/40 group">
            <div className="flex items-center gap-5 mb-8">
              <div className="p-4 bg-sky-500/10 rounded-2xl group-hover:bg-sky-500/20 transition-all">
                <Sparkles className="text-sky-400 animate-pulse" size={24} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.5em] text-sky-400/30 font-black">Causal_Otorite</div>
                <div className="text-sm font-black text-white tracking-widest">{CODEX_DATE}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white/5 p-4 rounded-3xl border border-white/5 shadow-inner">
                <div className="text-[9px] uppercase mb-1 text-sky-500/40 font-black tracking-widest">Protokol</div>
                <div className="text-2xl font-black text-white tabular-nums">%{world.codexSync}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-3xl border border-white/5 shadow-inner">
                <div className="text-[9px] uppercase mb-1 text-sky-500/40 font-black tracking-widest">Mesh_Hz</div>
                <div className="text-2xl font-black text-sky-400 tabular-nums">{world.fps}</div>
              </div>
            </div>
          </div>

          <div className="bg-black/70 backdrop-blur-md border border-sky-500/10 p-6 rounded-[2.5rem] pointer-events-auto max-w-sm hover:bg-black/80 transition-all border-t-sky-500/30 shadow-2xl">
            <div className="text-[9px] uppercase tracking-[0.3em] text-sky-400/40 mb-4 flex items-center gap-3 font-black">
              <BookOpen size={12} /> Otorite_Parcaciklari
            </div>
            <div className="space-y-3 max-h-48 overflow-y-auto no-scrollbar">
              {world.memoryShards.length === 0 && (
                <div className="p-4 bg-sky-500/5 rounded-2xl border border-white/5 text-[11px] text-sky-200/30 italic">
                  Firebase bellek parcalari bekleniyor.
                </div>
              )}
              {world.memoryShards.map((shard) => (
                <div key={shard.id} className="p-4 bg-sky-500/5 rounded-2xl border border-white/5 text-[11px] text-sky-200/40 flex justify-between hover:bg-sky-500/10 transition-colors">
                  <span className="truncate mr-4 italic">"{shard.content || 'ERISILIYOR...'}"</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_8px_#0ea5e9] self-center shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-black/90 backdrop-blur-3xl border border-sky-500/20 p-10 rounded-[3rem] pointer-events-auto w-80 shadow-4xl">
          <div className="flex justify-between items-center mb-8">
            <div className="text-[10px] uppercase tracking-widest font-black text-sky-500/30 flex items-center gap-3">
              <Radio size={16} className="text-emerald-500 animate-pulse" /> Varlik_Dugumu
            </div>
            <div className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 text-[8px] font-black uppercase tracking-widest border border-sky-500/20">
              {world.gpuTier}
            </div>
          </div>
          <div className="space-y-3 h-52 overflow-hidden font-mono">
            {logs.logs.map((log) => (
              <div key={log.id} className="text-[10px] flex gap-3 border-b border-white/5 pb-3 font-bold opacity-50 hover:opacity-100 transition-opacity">
                <span className="text-sky-500/20">[{log.ts.split(' ')[0]}]</span>
                <span className={log.type === 'ERR' ? 'text-rose-500' : 'text-white/50'}>{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-4xl px-12 z-20 pointer-events-auto">
        <div className="bg-black/95 backdrop-blur-4xl border border-sky-500/20 rounded-[4.5rem] p-5 flex items-center gap-8 shadow-4xl ring-1 ring-sky-500/20 focus-within:border-sky-500/50 transition-all focus-within:ring-sky-500/40">
          <div className="bg-sky-500/10 p-6 rounded-full ml-4 group">
            <Terminal size={32} className="text-sky-400 group-hover:scale-110 transition-all" />
          </div>
          <input
            type="text"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleExecute()}
            placeholder="KODEX_OTO_ERISIM_2025_07_12..."
            className="flex-1 bg-transparent border-none outline-none text-sky-50 text-2xl font-black tracking-[0.4em] uppercase placeholder:text-sky-900/30 min-w-0"
          />
          <button
            type="button"
            onClick={handleExecute}
            disabled={ui.processing || !ui.connected}
            className="p-10 bg-sky-600 rounded-[3.5rem] hover:bg-sky-400 transition-all active:scale-95 disabled:opacity-50 shadow-[0_0_60px_rgba(14,165,233,0.3)]"
            aria-label="Causal command execute"
          >
            {ui.processing ? <RefreshCcw size={36} className="animate-spin text-black" /> : <ChevronRight size={36} className="text-black" />}
          </button>
        </div>

        <div className="flex justify-between mt-12 px-16 text-[11px] uppercase tracking-[1em] font-black text-sky-500/20">
          <div className="flex items-center gap-4"><Layers size={14} /> HUCRE_ID: {ui.currentCell}</div>
          <div className="text-sky-400/20 tracking-[0.6em]">EGEMEN_KURTARMA_PROTOKOLU</div>
          <div className="flex items-center gap-4">KALITE: %{Math.round(world.renderQuality * 100)} <Cpu size={14} /></div>
        </div>
      </div>
    </div>
  );
}
