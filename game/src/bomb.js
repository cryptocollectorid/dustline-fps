// The bomb: carried by the player (or a SABLE bot), dropped on death, planted at Site A
// on a 2.5 s channel, then a 30 s fuse. It beeps faster as the fuse runs down.
// Channels are driven by main.js (player) and bots.js (bots); this module owns the
// state, the mesh and the fuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FUSE_SECONDS = 30;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.4 }),
  );
  body.castShadow = true;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 2, roughness: 0.4 }),
  );
  lamp.position.set(0, 0.12, 0);
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);

  const state = {
    status: 'carried', // carried | dropped | planted | exploded | defused
    position: new THREE.Vector3(14, 0.09, -11),
    fuse: FUSE_SECONDS,
    beepTimer: 0,
    blink: 0,
  };

  return {
    state,
    reset() {
      state.status = 'carried';
      state.fuse = FUSE_SECONDS;
      state.beepTimer = 0;
      group.visible = false;
    },
    drop(position) {
      state.status = 'dropped';
      state.position.copy(position);
      state.position.y = 0.09;
      group.position.copy(state.position);
      group.visible = true;
    },
    pickUp() {
      state.status = 'carried';
      group.visible = false;
    },
    plant(position) {
      state.status = 'planted';
      state.fuse = FUSE_SECONDS;
      state.position.copy(position);
      state.position.y = 0.09;
      group.position.copy(state.position);
      group.visible = true;
    },
    defuse() {
      state.status = 'defused';
      group.visible = false;
    },
    explode() {
      state.status = 'exploded';
      group.visible = false;
    },
    // Returns 'beep' when a fuse beep is due, 'explode' when the fuse runs out.
    step(dt) {
      if (state.status !== 'planted') return null;
      state.fuse -= dt;
      state.blink += dt;
      lamp.material.emissiveIntensity = (state.blink % 0.5 < 0.25) ? 2.5 : 0.4;
      const interval = Math.max(0.25, state.fuse / 30);
      state.beepTimer -= dt;
      if (state.beepTimer <= 0) {
        state.beepTimer = interval;
        if (state.fuse <= 0) return 'explode';
        return 'beep';
      }
      if (state.fuse <= 0) return 'explode';
      return null;
    },
  };
}

export { FUSE_SECONDS };
