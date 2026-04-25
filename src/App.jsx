import React, { useState, useRef, useEffect, useSyncExternalStore, useCallback } from 'react';
import * as THREE from 'three';
import {
  Sparkles,
  Cpu,
  ChevronRight,
  Activity,
  Command,
  RefreshCcw,
} from 'lucide-react';
import { appId, auth, firebaseApi, firebaseEnabled, rtdb } from './firebaseRuntime';

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
 * 2. DETERMINISTIC ECS STORE
 * ============================================================================
 */
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

const useStore = (store, selector) =>
  useSyncExternalStore(store.subscribe, () => selector(store.getState()));

const worldStore = createStore({ agents: new Map(), version: 0 });
const uiStore = createStore({ connected: false, cellId: 'c_alpha', processing: false });
const logStore = createStore({ logs: [] });

const addLog = (msg, type = 'SYS') => {
  logStore.setState((prev) => ({
    logs: [
      { ts: new Date().toLocaleTimeString(), type, msg, id: crypto.randomUUID() },
      ...prev.logs,
    ].slice(0, 15),
  }));
};

const createLocalAgent = (idx, phase = 0) => ({
  pos: {
    lat: Math.sin(idx * 1.7 + phase) * 58,
    lng: ((idx * 47 + phase * 90) % 360) - 180,
  },
});

const seedLocalAgents = () => {
  worldStore.setState((prev) => {
    const next = new Map(prev.agents);
    for (let idx = 0; idx < 48; idx += 1) {
      next.set(`local-agent-${idx}`, createLocalAgent(idx));
    }
    return { ...prev, agents: next, version: prev.version + 1 };
  });
};

/**
 * ============================================================================
 * 3. CAUSAL ENGINE (v154.0 - RESPONSIVE & HARDENED)
 * ============================================================================
 */
class CausalEngine {
  constructor(container) {
    this.container = container;
    this.active = true;
    this.disposed = false;
    this.rafId = null;

    this.needsDataSync = false;
    this.needsMatrixUpdate = false;

    this.instanceMap = new Map();
    this.freeSlots = [];
    this.nextIdx = 0;
    this.maxSlots = 8000;

    this.dummy = new THREE.Object3D();
    this.tempPos = new THREE.Vector3();
    this.tempUp = new THREE.Vector3(0, 0, 1);
    this.tempNormal = new THREE.Vector3();

    this.initScene();
    this.initListeners();
    this.animate(0);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      1,
      60000,
    );
    this.camera.position.z = 13000;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.globeGeo = new THREE.SphereGeometry(3500, 32, 32);
    this.globeMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      wireframe: true,
      transparent: true,
      opacity: 0.1,
    });
    this.globe = new THREE.Mesh(this.globeGeo, this.globeMat);

    this.agentGeo = new THREE.ConeGeometry(35, 95, 4).rotateX(Math.PI / 2);
    this.agentMat = new THREE.MeshPhongMaterial({ color: 0x0ea5e9, emissive: 0x0369a1 });
    this.agentMesh = new THREE.InstancedMesh(this.agentGeo, this.agentMat, this.maxSlots);

    this.scene.add(this.globe, this.agentMesh);
    this.scene.add(new THREE.AmbientLight(0x404040), new THREE.PointLight(0xffffff, 1.5));
  }

  initListeners() {
    this.onResize = () => {
      if (this.disposed) return;
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    };
    window.addEventListener('resize', this.onResize);
  }

  invalidate() {
    if (this.needsDataSync) return;
    this.needsDataSync = true;
  }

  sync() {
    if (this.disposed || !this.agentMesh) return;
    const { agents: agentsMap } = worldStore.getState();

    for (const [id, slotIdx] of this.instanceMap.entries()) {
      if (!agentsMap.has(id)) {
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.agentMesh.setMatrixAt(slotIdx, this.dummy.matrix);
        if (this.freeSlots.length < 5000) this.freeSlots.push(slotIdx);
        this.instanceMap.delete(id);
        this.needsMatrixUpdate = true;
      }
    }

    for (const [id, agent] of agentsMap) {
      if (!agent.pos) continue;
      let slotIdx = this.instanceMap.get(id);
      if (slotIdx === undefined) {
        slotIdx = this.freeSlots.length > 0 ? this.freeSlots.pop() : this.nextIdx++;
        if (slotIdx >= this.maxSlots) continue;
        this.instanceMap.set(id, slotIdx);
      }

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
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.agentMesh.setMatrixAt(slotIdx, this.dummy.matrix);
      this.needsMatrixUpdate = true;
    }
  }

  animate() {
    if (!this.active || this.disposed) return;
    this.rafId = requestAnimationFrame(() => this.animate());

    if (this.needsDataSync) {
      this.sync();
      this.needsDataSync = false;
    }

    if (this.needsMatrixUpdate) {
      this.agentMesh.instanceMatrix.needsUpdate = true;
      this.needsMatrixUpdate = false;
    }

    this.globe.rotation.y += 0.00018;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.active = false;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    if (this.rafId) cancelAnimationFrame(this.rafId);

    this.globeGeo.dispose();
    this.globeMat.dispose();
    this.agentGeo.dispose();
    this.agentMat.dispose();
    this.renderer?.dispose();
    this.scene?.clear();
    if (this.container && this.renderer?.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

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

    const engine = new CausalEngine(containerRef.current);
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

    firebaseApi.onChildAdded(agentsRef, onAdd);
    firebaseApi.onChildChanged(agentsRef, onChange);
    firebaseApi.onChildRemoved(agentsRef, onRemove);

    const presenceRef = firebaseApi.ref(rtdb, `presence/${appId}/users/${user.uid}`);
    firebaseApi.onDisconnect(presenceRef).remove();
    firebaseApi.set(presenceRef, { status: 'online', ts: Date.now(), cell: cellId });

    return () => {
      firebaseApi.off(agentsRef, 'child_added', onAdd);
      firebaseApi.off(agentsRef, 'child_changed', onChange);
      firebaseApi.off(agentsRef, 'child_removed', onRemove);
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
