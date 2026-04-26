import * as THREE from 'three';

const WORKER_CODE = `
  let worldState = {};
  self.onmessage = function onMessage(event) {
    const { type, payload } = event.data;
    if (type === 'SYNC') {
      worldState = payload || {};
      self.postMessage({ type: 'TICK', state: worldState });
    }
  };
`;

export class RhizohEngine {
  constructor(container) {
    this.container = container;
    this.active = true;
    this.disposed = false;
    this.rafId = null;

    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    this.workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerUrl);
    this.worker.onmessage = (event) => this.onWorkerTick(event.data);

    this.instanceMap = new Map();
    this.freeSlots = [];
    this.nextIdx = 0;
    this.maxSlots = 15000;

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
      40,
      this.container.clientWidth / this.container.clientHeight,
      1,
      100000,
    );
    this.camera.position.z = 15000;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.globeGeo = new THREE.SphereGeometry(3500, 64, 64);
    this.globeMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      wireframe: true,
      transparent: true,
      opacity: 0.06,
    });
    this.globe = new THREE.Mesh(this.globeGeo, this.globeMat);

    this.agentGeo = new THREE.ConeGeometry(30, 100, 4).rotateX(Math.PI / 2);
    this.agentMat = new THREE.MeshPhongMaterial({ color: 0x0ea5e9, emissive: 0x0369a1 });
    this.agentMesh = new THREE.InstancedMesh(this.agentGeo, this.agentMat, this.maxSlots);

    this.scene.add(this.globe, this.agentMesh);
    this.scene.add(new THREE.AmbientLight(0x222222), new THREE.PointLight(0xffffff, 2.5));
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

  onWorkerTick(data) {
    if (data.type === 'TICK') {
      this.renderWorld(data.state);
    }
  }

  invalidate(state) {
    if (this.disposed) return;
    this.worker.postMessage({ type: 'SYNC', payload: state || {} });
  }

  renderWorld(source) {
    if (this.disposed || !this.agentMesh) return;

    for (const [id, slotIdx] of this.instanceMap.entries()) {
      if (!source[id]) {
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.agentMesh.setMatrixAt(slotIdx, this.dummy.matrix);
        this.freeSlots.push(slotIdx);
        this.instanceMap.delete(id);
      }
    }

    for (const id in source) {
      const agent = source[id];
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
    }

    this.agentMesh.instanceMatrix.needsUpdate = true;
  }

  animate(time) {
    if (!this.active || this.disposed) return;
    this.rafId = requestAnimationFrame((nextTime) => this.animate(nextTime));

    this.globe.rotation.y += 0.0001;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.active = false;
    this.disposed = true;
    this.worker?.terminate();
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
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
