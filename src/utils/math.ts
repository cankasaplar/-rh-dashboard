import * as THREE from 'three';
import type { Coordinates } from '../types/domain';
export const coordinatesToSphere = (pos: Coordinates, radius: number, target = new THREE.Vector3()) => { const phi = (90 - pos.lat) * (Math.PI / 180); const theta = (pos.lng + 180) * (Math.PI / 180); return target.set(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)); };
