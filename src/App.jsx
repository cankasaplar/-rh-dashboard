import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  getDatabase,
  off,
  onDisconnect,
  ref,
  remove,
  set,
} from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  BookOpen,
  ChevronRight,
  Command,
  Ghost as GhostIcon,
  Hash,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';

// ============================================================================
// 1. KERNEL SETTINGS [v143.0 - MULTI-INDEXED WORLD RUNTIME]
// ============================================================================
const CODEX_VERSION = 'v143.0-INDEXED';
const CODEX_ANCHOR = '2025-07-12';
const APP_ID = 'castle-8cb15';
const REGION = 'europe-west3';
const RENDER_BUDGET_MS = 16.6;
const MAX_NODES = 5000;
const MAX_LOGS = 12;

const firebaseConfig = {
  apiKey: 'AIzaSyB_Cl3B1QOmwPnVPkHu2WNtLzYHmbnIjPY',
  authDomain: `${APP_ID}.firebaseapp.com`,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || `https://${APP_ID}-default-rtdb.firebaseio.com`,
  projectId: APP_ID,
  storageBucket: `${APP_ID}.firebasestorage.app`,
  messagingSenderId: '329052147568',
  appId: '1:329052147568:web:cd67e78d5676acf7b0c9b5',
  measurementId: 'G-2YZVPM5J6J',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const rtdb = getDatabase(app);
const functions = getFunctions(app, REGION);

// ============================================================================
// 2. ATOMIC STORE SYSTEM (STABLE OPS)
// ============================================================================
const createStore = (initialState) => {
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

const nodesStore = createStore({ nodes: {}, isDirty: false });
const worldStore = createStore({ ghostPets: {}, memoryShards: [], protests: [] });
const opsStore = createStore({
  latency: 0,
  cellLoad: 0,
  heartbeatDrift: 0,
  renderLoad: 0,
  costIndex: 0,
  readsCount: 0,
  writesCount: 0,
  lastCheck: Date.now(),
});
const uiStore = createStore({
  currentCell: 'c_410_290',
  connected: false,
  processing: false,
  globalSpike: false,
  activeLayer: 'NODES',
});
const logStore = createStore({ logs: [] });

const addLog = (msg, type = 'SYS') => {
  logStore.setState((state) => ({
    logs: [
      { ts: new Date().toLocaleTimeString(), type, msg, id: crypto.randomUUID() },
      ...state.logs,
    ].slice(0, MAX_LOGS),
  }));
};

// ============================================================================
// 3. SOVEREIGN RENDER ENGINE
// ============================================================================
class SovereignEngine {
  constructor(container) {
    this.container = container;
    this.disposed = false;
    this.lastRender = 0;
    this.instanceMap = new Map();
    this.freeSlots = [];
    this.nextIdx = 0;
    this.dummy = new THREE.Object3D();
    this.up = new THREE.Vector3(0, 0, 1);
    this.pos = new THREE.Vector3();
    this.frame = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      10,
      100000,
    );
    this.camera.position.set(0, 0, 12000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.container.appendChild(this.renderer.domElement);

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);

    this.setupGlobe();
    this.setupInstances();
    this.animate(0);
  }

  setupGlobe() {
    this.globeGeometry = new THREE.SphereGeometry(3500, 64, 64);
    this.globeMaterial = new THREE.MeshBasicMaterial({
      color: 0x0891b2,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    this.globe = new THREE.Mesh(this.globeGeometry, this.globeMaterial);
    this.outerGlowGeometry = new THREE.SphereGeometry(3540, 64, 64);
    this.outerGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.035,
      side: THREE.BackSide,
    });
    this.outerGlow = new THREE.Mesh(this.outerGlowGeometry, this.outerGlowMaterial);
    this.scene.add(this.outerGlow, this.globe);
  }

  setupInstances() {
    this.pinGeometry = new THREE.CylinderGeometry(0, 12, 180, 6).rotateX(Math.PI / 2);
    this.pinMaterial = new THREE.MeshPhongMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.8,
    });
    this.pinMesh = new THREE.InstancedMesh(this.pinGeometry, this.pinMaterial, MAX_NODES);
    this.scene.add(this.pinMesh);
  }

  resize() {
    if (this.disposed) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  reserveSlot(id) {
    if (this.instanceMap.has(id)) return this.instanceMap.get(id);
    const slot = this.freeSlots.length > 0 ? this.freeSlots.pop() : this.nextIdx++;
    if (slot >= MAX_NODES) return null;
    this.instanceMap.set(id, slot);
    return slot;
  }

  hideSlot(slot) {
    this.dummy.position.set(0, 0, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.pinMesh.setMatrixAt(slot, this.dummy.matrix);
  }

  updateNodes(nodes) {
    if (this.disposed || opsStore.getState().renderLoad > RENDER_BUDGET_MS) return;

    const activeIds = new Set(Object.keys(nodes));

    for (const [id, slot] of Array.from(this.instanceMap.entries())) {
      if (!activeIds.has(id)) {
        this.hideSlot(slot);
        this.freeSlots.push(slot);
        this.instanceMap.delete(id);
      }
    }

    Object.entries(nodes).forEach(([id, node]) => {
      if (!node.pos) return;
      const slot = this.reserveSlot(id);
      if (slot === null) return;

      const phi = (90 - node.pos.lat) * (Math.PI / 180);
      const theta = (node.pos.lng + 180) * (Math.PI / 180);
      this.pos.set(
        -3500 * Math.sin(phi) * Math.cos(theta),
        3500 * Math.cos(phi),
        3500 * Math.sin(phi) * Math.sin(theta),
      );

      this.dummy.position.copy(this.pos);
      this.dummy.quaternion.setFromUnitVectors(this.up, this.pos.clone().normalize());
      this.dummy.scale.set(1, 1, Math.max(0.1, node.resonance || 0.5));
      this.dummy.updateMatrix();
      this.pinMesh.setMatrixAt(slot, this.dummy.matrix);
    });

    this.pinMesh.instanceMatrix.needsUpdate = true;
  }

  animate(time) {
    if (this.disposed) return;
    this.frame = requestAnimationFrame((nextTime) => this.animate(nextTime));
    if (time - this.lastRender < 30) return;

    const start = performance.now();
    this.globe.rotation.y += 0.0003;
    this.renderer.render(this.scene, this.camera);
    this.lastRender = time;
    opsStore.setState((state) => ({ ...state, renderLoad: Math.round(performance.now() - start) }));
  }

  terminate() {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
    this.pinGeometry.dispose();
    this.pinMaterial.dispose();
    this.globeGeometry.dispose();
    this.globeMaterial.dispose();
    this.outerGlowGeometry.dispose();
    this.outerGlowMaterial.dispose();
    this.renderer.dispose();
    this.scene.clear();
    if (this.container && this.renderer.domElement.parentNode) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

// ============================================================================
// 4. MAIN KERNEL LOGIC
// ============================================================================
export default function App() {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const subRefs = useRef({ nodes: null, pets: null, shards: null });
  const [intent, setIntent] = useState('');

  const ui = useSyncExternalStore(uiStore.subscribe, uiStore.getState);
  const world = useSyncExternalStore(worldStore.subscribe, worldStore.getState);
  const logs = useSyncExternalStore(logStore.subscribe, logStore.getState);

  const memoryShardCount = useMemo(() => world.memoryShards.length, [world.memoryShards]);
  const ghostPetCount = useMemo(() => Object.keys(world.ghostPets).length, [world.ghostPets]);

  const cleanupSubscriptions = useCallback(() => {
    Object.values(subRefs.current).forEach((unsubscribe) => unsubscribe?.());
    subRefs.current = { nodes: null, pets: null, shards: null };
  }, []);

  const syncMultiIndexedWorld = useCallback((cellId, uid) => {
    cleanupSubscriptions();

    const nodesQ = query(
      collection(db, 'artifacts', APP_ID, 'cells', cellId, 'nodes'),
      limit(300),
    );
    subRefs.current.nodes = onSnapshot(nodesQ, (snap) => {
      const batch = {};
      snap.forEach((item) => {
        batch[item.id] = item.data();
      });
      nodesStore.setState({ nodes: batch, isDirty: true });
      opsStore.setState((state) => ({
        ...state,
        cellLoad: snap.size,
        readsCount: state.readsCount + snap.size,
      }));
    });

    const petsQ = query(
      collection(db, 'ghostPetProgress'),
      where('userId', '==', uid),
      orderBy('totalInteractions', 'desc'),
      limit(5),
    );
    subRefs.current.pets = onSnapshot(petsQ, (snap) => {
      const pets = {};
      snap.forEach((item) => {
        pets[item.id] = item.data();
      });
      worldStore.setState((state) => ({ ...state, ghostPets: pets }));
      addLog('GHOST: Evrim verileri senkronize.', 'WORLD');
    });

    const shardsQ = query(
      collection(db, 'memoryShards'),
      where('tags', 'array-contains', `codex-${CODEX_ANCHOR}`),
      orderBy('createdAt', 'desc'),
      limit(10),
    );
    subRefs.current.shards = onSnapshot(shardsQ, (snap) => {
      const shards = [];
      snap.forEach((item) => shards.push({ id: item.id, ...item.data() }));
      worldStore.setState((state) => ({ ...state, memoryShards: shards }));
    });
  }, [cleanupSubscriptions]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    engineRef.current = new SovereignEngine(containerRef.current);
    let hbTimer = null;
    let presenceRef = null;
    let active = true;

    const boot = async () => {
      try {
        const { user } = await signInAnonymously(auth);
        if (!active) return;

        uiStore.setState((state) => ({ ...state, connected: true }));
        addLog(`SEC: Identity Mapped [${user.uid.slice(0, 6)}]`, 'SEC');
        syncMultiIndexedWorld(ui.currentCell, user.uid);

        presenceRef = ref(rtdb, `presence/${APP_ID}/users/${user.uid}`);
        const pulse = () => {
          const now = Date.now();
          set(presenceRef, { status: 'online', lastSeen: now, cellId: uiStore.getState().currentCell });
          opsStore.setState((state) => ({
            ...state,
            heartbeatDrift: now - state.lastCheck,
            lastCheck: now,
            writesCount: state.writesCount + 1,
          }));
        };

        pulse();
        hbTimer = setInterval(pulse, 15000);
        onDisconnect(presenceRef).remove();
      } catch (err) {
        addLog(`BOOT_FAIL: ${err.message}`, 'CRITICAL');
      }
    };

    boot();

    return () => {
      active = false;
      cleanupSubscriptions();
      if (hbTimer) clearInterval(hbTimer);
      if (presenceRef) {
        remove(presenceRef);
        off(presenceRef);
      }
      uiStore.setState((state) => ({ ...state, connected: false }));
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, [cleanupSubscriptions, syncMultiIndexedWorld, ui.currentCell]);

  useEffect(() => {
    const unsubscribe = nodesStore.subscribe(() => {
      const { nodes, isDirty } = nodesStore.getState();
      if (isDirty && engineRef.current) {
        engineRef.current.updateNodes(nodes);
        nodesStore.setState((state) => ({ ...state, isDirty: false }));
      }
    });
    return unsubscribe;
  }, []);

  const handleIntent = async () => {
    if (!intent.trim() || ui.processing) return;

    uiStore.setState((state) => ({ ...state, processing: true }));
    addLog(`INTENT: ${intent.toUpperCase()}`, 'USER');

    try {
      const causalFn = httpsCallable(functions, 'resolveCausalAction');
      const result = await causalFn({ intent, cellId: ui.currentCell });
      addLog(`RESOLVE: ${result.data?.status || 'Complete'}`);
    } catch {
      addLog('FAIL: Causal Breach.', 'CRITICAL');
    } finally {
      setIntent('');
      uiStore.setState((state) => ({ ...state, processing: false }));
    }
  };

  return (
    <div className="h-screen w-full bg-[#010204] text-white font-mono overflow-hidden relative selection:bg-cyan-500/30">
      <div ref={containerRef} className="absolute inset-0 z-0" />

      <div className="absolute top-8 left-8 z-50 w-80 space-y-4 pointer-events-none">
        <div className="bg-black/90 backdrop-blur-3xl border border-white/10 p-6 rounded-[2.5rem] pointer-events-auto shadow-2xl ring-1 ring-white/5 border-t-white/10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-emerald-400" size={18} />
              <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                Sovereign_OS
              </div>
            </div>
            <div className={`w-2 h-2 rounded-full ${ui.connected ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-rose-500'} animate-pulse`} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
              <div className="text-[8px] text-white/30 uppercase font-black mb-1 flex items-center gap-1">
                <GhostIcon size={10} /> Pets
              </div>
              <div className="text-sm font-black text-purple-400 tabular-nums">{ghostPetCount}</div>
            </div>
            <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
              <div className="text-[8px] text-white/30 uppercase font-black mb-1 flex items-center gap-1">
                <BookOpen size={10} /> Codex
              </div>
              <div className="text-sm font-black text-amber-500 tabular-nums">{memoryShardCount}</div>
            </div>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl border border-white/5 p-6 rounded-[2.5rem] pointer-events-auto h-64 overflow-hidden flex flex-col shadow-2xl">
          <div className="text-[8px] text-white/20 uppercase flex items-center gap-2 mb-4 font-black">
            <Hash size={10} /> Codex_Live_Stream
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar font-black">
            {world.memoryShards.map((shard) => (
              <div key={shard.id} className="text-[9px] border-l-2 border-amber-500/20 bg-amber-500/5 p-2 rounded-lg animate-in">
                <div className="flex justify-between mb-1">
                  <span className="text-amber-400/60 font-bold uppercase">{shard.id.slice(0, 8)}</span>
                  <span className="opacity-10 text-[7px]">{shard.tags?.[0]}</span>
                </div>
                <p className="text-[10px] text-white/40 italic line-clamp-2">
                  &quot;{shard.content || 'Memory Fragment Data'}&quot;
                </p>
              </div>
            ))}
            {world.memoryShards.length === 0 && (
              <div className="text-[9px] text-white/10 uppercase text-center mt-12 italic">
                Searching Memory Shards...
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="absolute top-8 right-8 z-50 w-72 pointer-events-none hidden md:block">
        <div className="bg-black/50 border border-white/5 rounded-[2rem] p-5 pointer-events-auto backdrop-blur-xl">
          <div className="text-[8px] uppercase tracking-[0.4em] text-white/20 font-black mb-4">
            Kernel_Telemetry
          </div>
          <div className="space-y-2 text-[10px] text-white/40">
            {logs.logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-cyan-400/30">[{log.ts}]</span>
                <span className={log.type === 'CRITICAL' ? 'text-rose-400' : ''}>{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[500] w-full max-w-2xl px-8 pointer-events-none">
        <div className="bg-black/95 border border-white/10 rounded-[4rem] p-3 shadow-4xl backdrop-blur-5xl flex items-center gap-4 pointer-events-auto ring-1 ring-white/5 border-t-white/10 group focus-within:border-cyan-500/30 transition-all">
          <div className="ml-6 p-3 bg-cyan-500/10 rounded-3xl">
            <Command size={22} className="text-cyan-400" />
          </div>
          <input
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleIntent();
            }}
            placeholder="ACCESS_CODEX_SHARD..."
            className="flex-1 bg-transparent p-4 text-sm font-black outline-none text-white placeholder:text-white/5 uppercase tracking-[0.2em]"
          />
          <button
            type="button"
            onClick={handleIntent}
            disabled={ui.processing || !ui.connected}
            className="p-7 bg-cyan-600 rounded-[3rem] hover:bg-cyan-500 transition-all active:scale-90 shadow-[0_0_30px_rgba(6,182,212,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Resolve causal intent"
          >
            {ui.processing ? (
              <RefreshCcw size={28} className="animate-spin text-black" />
            ) : (
              <ChevronRight size={28} className="text-black" />
            )}
          </button>
        </div>
        <div className="text-center mt-6">
          <span className="text-[9px] text-white/20 uppercase tracking-[0.8em] italic font-black">
            Runtime: {CODEX_VERSION} / Multi-Indexed_Causal_Core
          </span>
        </div>
      </div>
    </div>
  );
}
