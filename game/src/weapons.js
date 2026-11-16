// Weapons: three hitscan guns with their own numbers, plus the frag grenade.
// The rig owns the view models, the magazine, the reload, the bloom that punishes
// moving and spraying; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 48,
    damage: 34, headMult: 3, fireGap: 0.22, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.03, auto: false, range: 60,
  },
  rifle: {
    key: 'rifle', name: 'LR-7 Longshot', price: 2500, mag: 30, reserve: 90,
    damage: 33, headMult: 4, fireGap: 0.1, reloadTime: 2.1,
    spreadStill: 0.0022, spreadMove: 0.028, auto: true, range: 80,
  },
  smg: {
    key: 'smg', name: 'KX-9 Whisper', price: 1500, mag: 25, reserve: 100,
    damage: 22, headMult: 3, fireGap: 0.07, reloadTime: 1.7,
    spreadStill: 0.005, spreadMove: 0.035, auto: true, range: 45,
  },
};

const GRENADE_PRICE = 300;
const GRENADE_FUSE = 1.4;
const GRENADE_RADIUS = 6;
const GRENADE_DAMAGE = 120;

export function createWeaponRig(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.35 });
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
  }

  const models = {};
  const pistol = new THREE.Group();
  pistol.add(box(0.05, 0.07, 0.24, 0, 0, -0.1, dark));
  pistol.add(box(0.045, 0.12, 0.07, 0, -0.07, 0.02, grip));
  pistol.add(box(0.02, 0.02, 0.05, 0, 0.045, -0.2, accent));
  pistol.position.set(0.24, -0.2, -0.42);
  models.pistol = pistol;

  const rifle = new THREE.Group();
  rifle.add(box(0.09, 0.1, 0.42, 0, 0, 0, dark));
  rifle.add(box(0.045, 0.045, 0.4, 0, 0.025, -0.38, grip));
  rifle.add(box(0.075, 0.08, 0.22, 0, -0.02, 0.3, grip));
  rifle.add(box(0.06, 0.14, 0.08, 0, -0.1, -0.05, grip));
  rifle.add(box(0.02, 0.03, 0.1, 0, 0.06, -0.15, accent));
  rifle.position.set(0.26, -0.23, -0.52);
  rifle.scale.setScalar(0.8);
  models.rifle = rifle;

  const smg = new THREE.Group();
  smg.add(box(0.08, 0.09, 0.3, 0, 0, 0, dark));
  const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), grip);
  suppressor.rotation.x = Math.PI / 2;
  suppressor.position.set(0, 0.01, -0.26);
  smg.add(suppressor);
  smg.add(box(0.06, 0.12, 0.07, 0, -0.09, -0.02, grip));
  smg.add(box(0.02, 0.02, 0.08, 0, 0.05, -0.1, accent));
  smg.position.set(0.26, -0.23, -0.5);
  smg.scale.setScalar(0.9);
  models.smg = smg;

  for (const key of Object.keys(models)) {
    models[key].visible = false;
    camera.add(models[key]);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    grenades: 0,
    switching: 0,
  };
  models.pistol.visible = true;

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.05);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.switching > 0) {
      state.switching = Math.max(0, state.switching - dt);
      model.position.y = -0.2 - 0.12 * Math.sin((state.switching / 0.3) * Math.PI);
    } else {
      model.position.y = -0.2;
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, ((currentDef().reloadTime - state.reloadLeft) * 2));
      if (state.reloadLeft === 0) {
        const def = currentDef();
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  function currentDef() {
    return WEAPONS[state.current];
  }

  return {
    state,
    currentDef,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switching === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef().fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.05, state.bloom + 0.004);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === currentDef().mag || state.reserve === 0) return false;
      state.reloadLeft = currentDef().reloadTime;
      return true;
    },
    switchTo(key) {
      if (!WEAPONS[key] || key === state.current || state.switching > 0) return false;
      models[state.current].visible = false;
      state.current = key;
      state.mag = WEAPONS[key].mag;
      state.reserve = WEAPONS[key].reserve;
      models[key].visible = true;
      state.switching = 0.3;
      state.cooldown = 0.3;
      state.reloadLeft = 0;
      state.bloom = 0;
      return true;
    },
    giveWeapon(key) {
      if (!WEAPONS[key]) return;
      models[state.current].visible = false;
      state.current = key;
      state.mag = WEAPONS[key].mag;
      state.reserve = WEAPONS[key].reserve;
      models[key].visible = true;
      state.reloadLeft = 0;
      state.bloom = 0;
    },
    addGrenades(count) {
      state.grenades += count;
    },
    spread(speed) {
      const def = currentDef();
      const moving = Math.min(1, speed / 5.2) * def.spreadMove;
      return def.spreadStill + moving + state.bloom;
    },
    refill() {
      const def = currentDef();
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    resetToPistol() {
      this.giveWeapon('pistol');
      state.grenades = 0;
    },
  };
}

// Frag grenades: thrown in an arc, bounce once off the world, detonate on a fuse.
// step() returns the explosions that happened this step, for main.js to damage.
export function createGrenades(scene, colliders) {
  const items = [];
  const booms = [];
  const probe = new THREE.Box3();
  const material = new THREE.MeshStandardMaterial({ color: 0x2e4a2a, roughness: 0.6, metalness: 0.3 });

  function throwGrenade(origin, direction) {
    if (items.length >= 4) return;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), material);
    mesh.position.copy(origin);
    scene.add(mesh);
    items.push({
      mesh,
      velocity: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
      fuse: GRENADE_FUSE,
    });
  }

  function step(dt) {
    const explosions = [];
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      item.fuse -= dt;
      item.velocity.y -= 20 * dt;
      const next = item.mesh.position.clone().addScaledVector(item.velocity, dt);
      probe.min.set(next.x - 0.09, next.y - 0.09, next.z - 0.09);
      probe.max.set(next.x + 0.09, next.y + 0.09, next.z + 0.09);
      let blocked = false;
      for (const collider of colliders) {
        if (probe.intersectsBox(collider)) { blocked = true; break; }
      }
      if (blocked) {
        item.velocity.multiplyScalar(-0.35);
        item.velocity.y = Math.abs(item.velocity.y) * 0.4;
      } else {
        item.mesh.position.copy(next);
      }
      if (item.mesh.position.y < 0.09) {
        item.mesh.position.y = 0.09;
        item.velocity.y = Math.abs(item.velocity.y) * 0.4;
        item.velocity.x *= 0.7;
        item.velocity.z *= 0.7;
      }
      if (item.fuse <= 0) {
        const boom = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 12),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false }),
        );
        boom.position.copy(item.mesh.position);
        scene.add(boom);
        const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 18);
        light.position.copy(item.mesh.position).add(new THREE.Vector3(0, 0.5, 0));
        scene.add(light);
        booms.push({ boom, light, age: 0 });
        explosions.push({ position: item.mesh.position.clone(), radius: GRENADE_RADIUS, damage: GRENADE_DAMAGE });
        scene.remove(item.mesh);
        items.splice(i, 1);
      }
    }
    // The flash of an explosion grows and fades over 0.4 s, then is removed.
    for (let i = booms.length - 1; i >= 0; i -= 1) {
      const entry = booms[i];
      entry.age += dt;
      const t = entry.age / 0.4;
      entry.boom.scale.setScalar(1 + t * GRENADE_RADIUS);
      entry.boom.material.opacity = Math.max(0, 0.85 * (1 - t));
      entry.light.intensity = Math.max(0, 60 * (1 - t));
      if (t >= 1) {
        scene.remove(entry.boom);
        scene.remove(entry.light);
        booms.splice(i, 1);
      }
    }
    return explosions;
  }

  return { throwGrenade, step };
}

export { GRENADE_PRICE, GRENADE_FUSE, GRENADE_RADIUS };
