import * as THREE from 'three';
import { opsStore } from './ECSStore';
import { coordinatesToSphere } from '../utils/math';
import { runtimeEnv } from '../utils/env';
import type { NodeRecord } from '../types/domain';
export class SovereignEngine {
  private disposed = false; private lastRender = 0; private readonly instanceMap = new Map<string, number>(); private readonly freeSlots: number[] = []; private nextIdx = 0; private frame = 0;
  private readonly scene = new THREE.Scene(); private readonly camera: THREE.PerspectiveCamera; private readonly renderer: THREE.WebGLRenderer; private readonly dummy = new THREE.Object3D(); private readonly up = new THREE.Vector3(0, 0, 1); private readonly pos = new THREE.Vector3();
  private readonly globeGeometry = new THREE.SphereGeometry(3500, 64, 64); private readonly globeMaterial = new THREE.MeshBasicMaterial({ color: 0x0891b2, wireframe: true, transparent: true, opacity: 0.22 });
  private readonly outerGlowGeometry = new THREE.SphereGeometry(3540, 64, 64); private readonly outerGlowMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.035, side: THREE.BackSide });
  private readonly pinGeometry = new THREE.CylinderGeometry(0, 12, 180, 6).rotateX(Math.PI / 2); private readonly pinMaterial = new THREE.MeshPhongMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.8 });
  private readonly globe = new THREE.Mesh(this.globeGeometry, this.globeMaterial); private readonly outerGlow = new THREE.Mesh(this.outerGlowGeometry, this.outerGlowMaterial); private readonly pinMesh = new THREE.InstancedMesh(this.pinGeometry, this.pinMaterial, runtimeEnv.maxNodes);
  private readonly worker = new Worker(new URL('./Worker.ts', import.meta.url), { type: 'module' });
  constructor(private readonly container: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 10, 100000); this.camera.position.set(0, 0, 12000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); this.renderer.setSize(container.clientWidth, container.clientHeight); this.container.appendChild(this.renderer.domElement);
    this.scene.add(this.outerGlow, this.globe, this.pinMesh, new THREE.AmbientLight(0xffffff, 0.5));
    this.worker.onmessage = (event: MessageEvent<{ type: string; nodes: Record<string, NodeRecord> }>) => { if (event.data.type === 'WORLD_TICK') this.renderNodes(event.data.nodes); };
    window.addEventListener('resize', this.resize); this.animate(0);
  }
  updateNodes(nodes: Record<string, NodeRecord>) { if (this.disposed || opsStore.getState().renderLoad > runtimeEnv.renderBudgetMs) return; this.worker.postMessage({ type: 'SYNC_WORLD', nodes }); }
  private readonly resize = () => { if (this.disposed) return; this.camera.aspect = this.container.clientWidth / this.container.clientHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(this.container.clientWidth, this.container.clientHeight); };
  private reserveSlot(id: string) { if (this.instanceMap.has(id)) return this.instanceMap.get(id) ?? null; const slot = this.freeSlots.length > 0 ? this.freeSlots.pop() : this.nextIdx++; if (slot === undefined || slot >= runtimeEnv.maxNodes) return null; this.instanceMap.set(id, slot); return slot; }
  private hideSlot(slot: number) { this.dummy.position.set(0, 0, 0); this.dummy.scale.set(0, 0, 0); this.dummy.updateMatrix(); this.pinMesh.setMatrixAt(slot, this.dummy.matrix); }
  private renderNodes(nodes: Record<string, NodeRecord>) {
    const activeIds = new Set(Object.keys(nodes)); for (const [id, slot] of Array.from(this.instanceMap.entries())) { if (!activeIds.has(id)) { this.hideSlot(slot); this.freeSlots.push(slot); this.instanceMap.delete(id); } }
    Object.entries(nodes).forEach(([id, node]) => { if (!node.pos) return; const slot = this.reserveSlot(id); if (slot === null) return; coordinatesToSphere(node.pos, 3500, this.pos); this.dummy.position.copy(this.pos); this.dummy.quaternion.setFromUnitVectors(this.up, this.pos.clone().normalize()); this.dummy.scale.set(1, 1, Math.max(0.1, node.resonance || 0.5)); this.dummy.updateMatrix(); this.pinMesh.setMatrixAt(slot, this.dummy.matrix); });
    this.pinMesh.instanceMatrix.needsUpdate = true;
  }
  private animate(time: number) { if (this.disposed) return; this.frame = requestAnimationFrame((nextTime) => this.animate(nextTime)); if (time - this.lastRender < 30) return; const start = performance.now(); this.globe.rotation.y += 0.0003; this.outerGlow.rotation.y += 0.0002; this.renderer.render(this.scene, this.camera); this.lastRender = time; opsStore.setState((state) => ({ ...state, renderLoad: Math.round(performance.now() - start) })); }
  terminate() { this.disposed = true; cancelAnimationFrame(this.frame); this.worker.terminate(); window.removeEventListener('resize', this.resize); this.pinGeometry.dispose(); this.pinMaterial.dispose(); this.globeGeometry.dispose(); this.globeMaterial.dispose(); this.outerGlowGeometry.dispose(); this.outerGlowMaterial.dispose(); this.renderer.dispose(); this.scene.clear(); if (this.renderer.domElement.parentNode) this.container.removeChild(this.renderer.domElement); }
}
