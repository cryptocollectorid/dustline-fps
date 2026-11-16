// Dustline Yard: a dusk desert freight yard, 44 x 32 m, built from boxes and cylinders.
// South is the SABLE (attacker) spawn, north is the VULTURE (defender) side, Site A sits
// north-east. Three ways in: Long lane west (open sightline), Mid (containers), Short lane
// east (crates and barrels). A low deck in the north-west is a player-only vantage.
// Every solid is a collider for movement and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph for the bots: nodes bots walk between, links they may use.
export const WAYPOINTS = [
  { id: 'sableSpawn', x: 0, z: 12, links: ['sableSpawnL', 'sableSpawnR', 'midSouth'] },
  { id: 'sableSpawnL', x: -6, z: 12, links: ['sableSpawn', 'longSouth'] },
  { id: 'sableSpawnR', x: 6, z: 12, links: ['sableSpawn', 'shortSouth'] },
  { id: 'midSouth', x: 0, z: 6, links: ['sableSpawn', 'longSouth', 'shortSouth', 'mid'] },
  { id: 'longSouth', x: -15, z: 8, links: ['sableSpawnL', 'midSouth', 'longMid'] },
  { id: 'longMid', x: -15, z: 0, links: ['longSouth', 'longNorth', 'mid'] },
  { id: 'longNorth', x: -15, z: -8, links: ['longMid', 'vultureSpawn'] },
  { id: 'shortSouth', x: 14, z: 8, links: ['sableSpawnR', 'midSouth', 'shortMid'] },
  { id: 'shortMid', x: 14, z: 0, links: ['shortSouth', 'shortNorth', 'mid'] },
  { id: 'shortNorth', x: 14, z: -6, links: ['shortMid', 'siteAEdge', 'mid'] },
  { id: 'mid', x: 0, z: 1, links: ['midSouth', 'longMid', 'shortMid', 'siteAEdge'] },
  { id: 'siteAEdge', x: 8, z: -9, links: ['mid', 'shortNorth', 'siteA'] },
  { id: 'siteA', x: 14, z: -11, links: ['siteAEdge', 'shortNorth'] },
  { id: 'vultureSpawn', x: -8, z: -12, links: ['longNorth', 'vultureSpawn2'] },
  { id: 'vultureSpawn2', x: 2, z: -13, links: ['vultureSpawn', 'siteAEdge'] },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mat = {};
  for (const name of Object.keys(PALETTE)) {
    mat[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.94,
      metalness: 0.02,
    });
  }
  const sand = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1, metalness: 0 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x7a4a2e, roughness: 0.85, metalness: 0.15 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.6, metalness: 0.45 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 1.6, roughness: 0.4,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(radius, height, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: packed sand with a darker apron around the yard.
  box(44.4, 0.4, 32.4, 0, -0.2, 0, sand);
  // Perimeter walls, 4 m, open to the dusk sky.
  box(0.4, 4, 32.4, -22.2, 2, 0, mat.surface);
  box(0.4, 4, 32.4, 22.2, 2, 0, mat.surface);
  box(44.4, 4, 0.4, 0, 2, -16.2, mat.surface);
  box(44.4, 4, 0.4, 0, 2, 16.2, mat.surface);
  // Accent stripe along the north wall, so the far end reads at a glance.
  box(44.4, 0.18, 0.1, 0, 3.4, -15.95, mat.accent, false);

  // Spawn cover: two containers south of Mid so the defenders cannot snipe the
  // SABLE spawn down the open east and west lanes the moment a round goes live.
  box(2.4, 2.4, 2.4, 6, 1.2, 4, rust);
  box(2.4, 2.4, 2.4, -6, 1.2, 4, steel);

  // Mid: two stacked containers block the middle and split the lanes.
  box(6, 2.4, 2.4, -2, 1.2, -2, rust);
  box(6, 2.4, 2.4, -2, 3.6, -2, steel);
  box(2.4, 2.4, 2.4, 4.5, 1.2, -4, rust);
  box(1.1, 1.1, 1.1, -6.5, 0.55, -5.5, mat.hairline);
  box(1.1, 1.1, 1.1, -5.4, 0.55, -5.5, mat.hairline);
  box(1.1, 1.1, 1.1, -6.5, 1.65, -5.5, mat.hairline);
  // A crate stack closing the gap east of the containers, so the defenders cannot
  // snipe the SABLE spawn down the middle.
  box(1.1, 1.1, 1.1, 1, 0.55, -2.5, mat.hairline);
  box(1.1, 1.1, 1.1, 1, 1.65, -2.5, mat.hairline);

  // Long lane (west): sandbag lines at the lane edge to crouch behind, one crate,
  // and an open sightline down the middle.
  box(3.2, 0.9, 0.7, -17.8, 0.45, 3, mat.hairline);
  box(1.1, 1.1, 1.1, -17, 0.55, -3, mat.hairline);
  box(3.2, 0.9, 0.7, -17.8, 0.45, -6, mat.hairline);

  // Short lane (east): crates and a barrel cluster, tight corners.
  box(1.1, 1.1, 1.1, 16.5, 0.55, 4, mat.hairline);
  box(1.1, 1.1, 1.1, 17.7, 0.55, 4, mat.hairline);
  box(1.1, 1.1, 1.1, 17.1, 1.65, 4, mat.hairline);
  cylinder(0.45, 1.1, 12, 0.55, -6, rust);
  cylinder(0.45, 1.1, 13, 0.55, -5.2, steel);
  cylinder(0.45, 1.1, 12.4, 0.55, -7, mat.hairline);

  // Site A (north-east): a pocket of containers, the plant zone marked on the sand.
  box(2.4, 2.4, 6, 9.5, 1.2, -13.5, steel);
  box(6, 2.4, 2.4, 15, 1.2, -14.5, rust);
  box(1.1, 1.1, 1.1, 18.5, 0.55, -9, mat.hairline);
  // Plant cover inside the site: tall crates a crouched planter can hide behind.
  box(1.2, 1.4, 1.2, 12, 0.7, -12, mat.hairline);
  box(1.2, 1.4, 1.2, 16, 0.7, -11, mat.hairline);
  const siteRing = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  );
  siteRing.rotation.x = -Math.PI / 2;
  siteRing.position.set(14, 0.02, -11);
  group.add(siteRing);
  // A big "A" sign on the north wall above the site, built from three bars.
  box(0.35, 2.2, 0.15, 13.2, 2.6, -15.9, mat.accent, false);
  box(0.35, 2.2, 0.15, 14.8, 2.6, -15.9, mat.accent, false);
  box(1.9, 0.35, 0.15, 14, 2.6, -15.9, mat.accent, false);

  // North-west deck: a player-only vantage, reached from the east by two jumpable
  // steps (0.45 m, then 0.9 m, then the 1.2 m deck). Bots never path up here.
  box(6, 1.2, 4, -15, 0.6, -12, steel);
  box(1.6, 0.9, 2, -11.2, 0.45, -11, mat.hairline);
  box(1.6, 0.45, 2, -9.6, 0.22, -11, mat.hairline);

  // Light poles and a water tower silhouette beyond the north wall.
  for (const [x, z] of [[-10, 6], [10, -4]]) {
    cylinder(0.09, 5.5, x, 2.75, z, steel);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat);
    lamp.position.set(x, 5.6, z);
    group.add(lamp);
  }
  cylinder(0.5, 7, 4, 3.5, -24, rust, false);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), rust);
  tank.position.set(4, 8.4, -24);
  tank.castShadow = true;
  group.add(tank);

  // Light: a low amber sun from the west, a cool dusk fill, and a warm sky gradient.
  // The ambient lifts the wall shadows so the yard stays readable at dusk.
  scene.add(new THREE.AmbientLight(new THREE.Color(0x6a5a48), 0.55));
  const sky = new THREE.HemisphereLight(new THREE.Color(0x9a8aa8), new THREE.Color(0x5a4630), 1.5);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb36b), 3.0);
  sun.position.set(-14, 16, 10);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x7a86b8), 0.5);
  fill.position.set(12, 12, 14);
  scene.add(fill);

  return {
    colliders,
    shootables,
    group,
    waypoints: WAYPOINTS,
    siteA: { center: new THREE.Vector3(14, 0, -11), radius: 3.4 },
    sableSpawns: [new THREE.Vector3(0, 0, 12), new THREE.Vector3(-3, 0, 13), new THREE.Vector3(3, 0, 13)],
    vultureSpawns: [new THREE.Vector3(-8, 0, -12), new THREE.Vector3(2, 0, -13), new THREE.Vector3(17, 0, -12)],
  };
}
