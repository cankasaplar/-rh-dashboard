import * as THREE from 'three';

export class CausalEngine {
  constructor(container, worldStore) {
    this.container = container;
    this.worldStore = worldStore;
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
    this.animate();
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
    const { agents: agentsMap } = this.worldStore.getState();

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
