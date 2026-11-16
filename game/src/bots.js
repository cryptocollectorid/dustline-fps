// Bots: three VULTURE defenders and two SABLE allies, each a small state machine.
// patrol waypoints -> see or hear an enemy -> engage in bursts -> converge on the bomb
// when it is planted, dropped or needs planting. Perception runs at 5 Hz per bot;
// shooting is a hit-chance roll gated by line of sight, so a bot never shoots through
// a wall. Movement uses the same AABB collision as the player.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { range, pick } from './rng.js';

const BOT_SPEED = 3.6;
const BOT_HEALTH = 100;
const PERCEIVE_RANGE = 42;
const HEAR_RANGE = 28;
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.7;
const BURST_MIN = 3;
const BURST_MAX = 5;
const BOT_DAMAGE = 10;
const DEFUSE_SECONDS = 3;
const PLANT_SECONDS = 2.5;
const PICKUP_SECONDS = 1;

const SABLE_HOLD = ['longMid', 'shortMid', 'mid', 'midSouth'];
const VULTURE_HOLD = ['siteA', 'siteAEdge', 'shortNorth', 'longNorth', 'vultureSpawn', 'vultureSpawn2'];

function findPath(nodes, fromId, toId) {
  if (fromId === toId) return [toId];
  const previous = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift();
    const node = nodes.find((entry) => entry.id === current);
    if (!node) continue;
    for (const link of node.links) {
      if (previous.has(link)) continue;
      previous.set(link, current);
      if (link === toId) {
        const path = [toId];
        let at = current;
        while (at !== null) {
          path.unshift(at);
          at = previous.get(at);
        }
        return path;
      }
      queue.push(link);
    }
  }
  return [toId];
}

function nearestNode(nodes, x, z) {
  let best = nodes[0];
  let bestDistance = Infinity;
  for (const node of nodes) {
    const distance = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best.id;
}

export function createBots(scene, world, hooks) {
  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  const probe = new THREE.Box3();
  const fromVector = new THREE.Vector3();
  const toVector = new THREE.Vector3();
  const direction = new THREE.Vector3();

  const sableMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sable), roughness: 0.6, metalness: 0.1 });
  const vultureMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.vulture), roughness: 0.6, metalness: 0.1 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.2 });
  const visorSable = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sable), emissive: new THREE.Color(PALETTE.sable), emissiveIntensity: 0.9, roughness: 0.4 });
  const visorVulture = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.vulture), emissive: new THREE.Color(PALETTE.vulture), emissiveIntensity: 0.9, roughness: 0.4 });

  function buildBot(def) {
    const group = new THREE.Group();
    const bodyMaterial = def.team === 'sable' ? sableMaterial : vultureMaterial;
    const visorMaterial = def.team === 'sable' ? visorSable : visorVulture;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), darkMaterial);
    legL.position.set(-0.11, 0.25, 0);
    const legR = legL.clone();
    legR.position.x = 0.11;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), bodyMaterial);
    torso.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), darkMaterial);
    head.position.y = 1.32;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.06), visorMaterial);
    visor.position.set(0, 1.33, -0.13);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.55), darkMaterial);
    gun.position.set(0.18, 1.02, -0.3);
    group.add(legL, legR, torso, head, visor, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      name: def.name,
      team: def.team,
      group,
      torso,
      head,
      position: new THREE.Vector3(def.spawn.x, 0, def.spawn.z),
      yaw: def.team === 'vulture' ? Math.PI : 0,
      health: BOT_HEALTH,
      alive: true,
      state: 'patrol',
      path: [],
      pathIndex: 0,
      target: null,
      targetIsPlayer: false,
      reaction: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      aimTime: 0,
      perceiveTimer: def.offset,
      stuckTimer: 0,
      lastProgress: new THREE.Vector3(),
      channel: 0,
      channelKind: null,
      carryingBomb: false,
      fall: 0,
      holdTimer: 0,
    };
    torso.userData = { bot, part: 'torso' };
    head.userData = { bot, part: 'head' };
    hitMeshes.push(torso, head);
    group.position.copy(bot.position);
    bots.push(bot);
    return bot;
  }

  function spawnBots(random, sableSpawns, vultureSpawns) {
    buildBot({ name: 'Rook', team: 'sable', spawn: sableSpawns[1], offset: 0 });
    buildBot({ name: 'Wren', team: 'sable', spawn: sableSpawns[2], offset: 0.1 });
    buildBot({ name: 'Ash', team: 'vulture', spawn: vultureSpawns[0], offset: 0.2 });
    buildBot({ name: 'Bramble', team: 'vulture', spawn: vultureSpawns[1], offset: 0.3 });
    buildBot({ name: 'Kite', team: 'vulture', spawn: vultureSpawns[2], offset: 0.4 });
  }

  function hasLineOfSight(from, to) {
    direction.subVectors(to, from);
    const distance = direction.length();
    if (distance < 0.01) return true;
    direction.normalize();
    raycaster.set(from, direction);
    raycaster.far = distance;
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0;
  }

  function eyeOf(bot) {
    return fromVector.set(bot.position.x, bot.position.y + 1.45, bot.position.z);
  }

  function chestOf(bot) {
    return toVector.set(bot.position.x, bot.position.y + 1.1, bot.position.z);
  }

  function setPath(bot, goalId) {
    const fromId = nearestNode(world.waypoints, bot.position.x, bot.position.z);
    bot.path = findPath(world.waypoints, fromId, goalId);
    bot.pathIndex = 0;
  }

  function moveToward(bot, target, dt) {
    const dx = target.x - bot.position.x;
    const dz = target.z - bot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.15) return true;
    const stepLength = Math.min(distance, BOT_SPEED * dt);
    const nextX = bot.position.x + (dx / distance) * stepLength;
    const nextZ = bot.position.z + (dz / distance) * stepLength;
    probe.min.set(nextX - 0.34, bot.position.y + 0.04, nextZ - 0.34);
    probe.max.set(nextX + 0.34, bot.position.y + 1.72, nextZ + 0.34);
    let blocked = false;
    for (const collider of world.colliders) {
      if (probe.intersectsBox(collider)) { blocked = true; break; }
    }
    if (!blocked) {
      bot.position.x = nextX;
      bot.position.z = nextZ;
    }
    bot.yaw = Math.atan2(-dx, -dz);
    return distance < 0.3;
  }

  function followPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = world.waypoints.find((entry) => entry.id === bot.path[bot.pathIndex]);
    if (!node) {
      bot.pathIndex += 1;
      return false;
    }
    if (moveToward(bot, node, dt)) bot.pathIndex += 1;
    return bot.pathIndex >= bot.path.length;
  }

  function perceive(bot, dt, ctx, random) {
    bot.perceiveTimer -= dt;
    if (bot.perceiveTimer > 0) return;
    bot.perceiveTimer = 0.2;
    let best = null;
    let bestDistance = PERCEIVE_RANGE;
    const eye = eyeOf(bot).clone();
    if (ctx.playerAlive) {
      const playerChest = new THREE.Vector3(ctx.playerPos.x, ctx.playerPos.y + (ctx.playerCrouching ? 0.8 : 1.2), ctx.playerPos.z);
      const distance = eye.distanceTo(playerChest);
      if (distance < bestDistance) {
        direction.subVectors(playerChest, eye).normalize();
        const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
        if (direction.dot(forward) > 0.15 && hasLineOfSight(eye, playerChest)) {
          best = 'player';
          bestDistance = distance;
        }
      }
    }
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      const chest = chestOf(other).clone();
      const distance = eye.distanceTo(chest);
      if (distance >= bestDistance) continue;
      direction.subVectors(chest, eye).normalize();
      const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      if (direction.dot(forward) > 0.15 && hasLineOfSight(eye, chest)) {
        best = other;
        bestDistance = distance;
      }
    }
    if (best) {
      if (bot.target !== best) {
        bot.target = best;
        bot.targetIsPlayer = best === 'player';
        bot.reaction = range(random, REACTION_MIN, REACTION_MAX);
        bot.aimTime = 0;
        bot.state = 'engage';
      }
    } else if (bot.state === 'engage') {
      bot.target = null;
      bot.state = 'patrol';
      bot.path = [];
    }
  }

  function fireBurstShot(bot, ctx, random) {
    const eye = eyeOf(bot).clone();
    let targetPos;
    let targetSpeed = 0;
    if (bot.targetIsPlayer) {
      targetPos = new THREE.Vector3(ctx.playerPos.x, ctx.playerPos.y + 1.2, ctx.playerPos.z);
      targetSpeed = ctx.playerSpeed;
    } else {
      targetPos = new THREE.Vector3(bot.target.position.x, bot.target.position.y + 1.1, bot.target.position.z);
    }
    const distance = eye.distanceTo(targetPos);
    let chance = Math.max(0.08, Math.min(0.6, 0.38 - distance * 0.008 - targetSpeed * 0.03 + Math.min(bot.aimTime, 1) * 0.1));
    if (bot.targetIsPlayer && ctx.playerCrouching) chance *= 0.75;
    const hit = random() < chance;
    const end = targetPos.clone();
    if (!hit) {
      end.x += range(random, -1, 1);
      end.y += range(random, -0.4, 0.8);
      end.z += range(random, -1, 1);
    }
    hooks.onBotShot(bot, eye, end);
    if (!hit) return;
    const damage = Math.round(BOT_DAMAGE * range(random, 0.85, 1.15));
    if (bot.targetIsPlayer) hooks.onBotHitPlayer(damage, bot);
    else damageBot(bot.target, damage, bot);
  }

  function damageBot(bot, amount, attacker) {
    if (!bot.alive) return;
    bot.health -= amount;
    if (bot.channelKind) {
      bot.channel = 0;
      bot.channelKind = null;
    }
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      bot.target = null;
      if (bot.carryingBomb) {
        bot.carryingBomb = false;
        hooks.onBombDropped(bot.position.clone());
      }
      hooks.onBotKilled(bot, attacker);
    } else if (attacker && bot.state !== 'engage') {
      bot.state = 'investigate';
      setPath(bot, nearestNode(world.waypoints, attacker.position ? attacker.position.x : attacker.x, attacker.position ? attacker.position.z : attacker.z));
    }
  }

  function hearShot(bot, position) {
    if (!bot.alive || bot.state === 'engage') return;
    if (bot.position.distanceTo(position) > HEAR_RANGE) return;
    if (bot.state === 'defusing' || bot.state === 'planting') return;
    bot.state = 'investigate';
    setPath(bot, nearestNode(world.waypoints, position.x, position.z));
    bot.holdTimer = 0;
  }

  function stepBot(bot, dt, time, ctx, random) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = bot.position.y - bot.fall * 0.08;
      }
      return;
    }
    perceive(bot, dt, ctx, random);

    if (bot.state === 'engage' && bot.target) {
      let targetPos;
      if (bot.targetIsPlayer) targetPos = ctx.playerPos;
      else if (bot.target.alive) targetPos = bot.target.position;
      else {
        bot.target = null;
        bot.state = 'patrol';
        bot.path = [];
        return;
      }
      const dx = targetPos.x - bot.position.x;
      const dz = targetPos.z - bot.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.aimTime += dt;
      if (bot.reaction > 0) {
        bot.reaction -= dt;
        return;
      }
      if (bot.burstLeft <= 0) {
        if (bot.pauseTimer > 0) {
          bot.pauseTimer -= dt;
          return;
        }
        bot.burstLeft = Math.floor(range(random, BURST_MIN, BURST_MAX + 1));
        bot.burstTimer = 0;
      }
      bot.burstTimer -= dt;
      if (bot.burstTimer <= 0) {
        bot.burstTimer = 0.13;
        bot.burstLeft -= 1;
        fireBurstShot(bot, ctx, random);
        if (bot.burstLeft <= 0) bot.pauseTimer = range(random, 0.7, 1.2);
      }
      return;
    }

    // Bomb duties override patrolling.
    if (ctx.bomb.state === 'planted' && bot.team === 'vulture') {
      if (bot.state !== 'defusing') {
        const distance = bot.position.distanceTo(ctx.bomb.position);
        if (distance < 1.6) {
          bot.state = 'defusing';
          bot.channel = 0;
          bot.channelKind = 'defuse';
        } else if (distance < 4) {
          // Close to the bomb: walk straight at it, not via waypoints, so the
          // defuse channel can start even when the plant spot is off-waypoint.
          moveToward(bot, ctx.bomb.position, dt);
          bot.state = 'toSite';
          return;
        } else {
          bot.state = 'toSite';
          setPath(bot, 'siteA');
        }
      }
    } else if (ctx.bomb.state === 'dropped' && bot.team === 'sable') {
      if (!bot.carryingBomb && bot.state !== 'pickup') {
        bot.state = 'pickup';
        setPath(bot, nearestNode(world.waypoints, ctx.bomb.position.x, ctx.bomb.position.z));
      }
    } else if (bot.carryingBomb && bot.state !== 'planting') {
      const distance = bot.position.distanceTo(world.siteA.center);
      if (distance < world.siteA.radius) {
        bot.state = 'planting';
        bot.channel = 0;
        bot.channelKind = 'plant';
      } else {
        bot.state = 'toSite';
        setPath(bot, 'siteA');
      }
    }

    if (bot.state === 'defusing' || bot.state === 'planting') {
      bot.channel += dt;
      const needed = bot.channelKind === 'defuse' ? DEFUSE_SECONDS : PLANT_SECONDS;
      if (bot.channel >= needed) {
        if (bot.channelKind === 'defuse') hooks.onBombDefused(bot);
        else hooks.onBombPlanted(bot);
        bot.channel = 0;
        bot.channelKind = null;
        bot.state = 'patrol';
        bot.path = [];
      }
      return;
    }

    if (bot.state === 'pickup') {
      const arrived = followPath(bot, dt);
      const distance = bot.position.distanceTo(ctx.bomb.position);
      if (distance < 1.2) {
        bot.channel += dt;
        if (bot.channel >= PICKUP_SECONDS) {
          bot.carryingBomb = true;
          bot.channel = 0;
          hooks.onBombPickedUp(bot);
          bot.state = 'toSite';
          setPath(bot, 'siteA');
        }
      } else if (arrived) {
        bot.state = 'patrol';
        bot.path = [];
      }
      return;
    }

    if (bot.state === 'toSite' || bot.state === 'investigate') {
      const arrived = followPath(bot, dt);
      if (arrived) {
        if (bot.state === 'investigate') {
          bot.holdTimer += dt;
          bot.yaw += dt * 0.8;
          if (bot.holdTimer > 2) {
            bot.state = 'patrol';
            bot.path = [];
          }
        } else {
          bot.state = 'patrol';
          bot.path = [];
        }
      }
      return;
    }

    // Patrol: SABLE allies shadow the player, VULTURE defenders hold their side.
    if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
      bot.holdTimer += dt;
      if (bot.holdTimer < 1.2) return;
      bot.holdTimer = 0;
      let goal;
      if (bot.team === 'sable') {
        goal = nearestNode(world.waypoints, ctx.playerPos.x + range(random, -6, 6), ctx.playerPos.z + range(random, -6, 6));
      } else {
        goal = pick(random, VULTURE_HOLD);
      }
      setPath(bot, goal);
    }
    const arrived = followPath(bot, dt);
    if (arrived) {
      bot.path = [];
      bot.holdTimer = 0;
    }

    // Stuck: if the bot barely moved for a second, pick a different waypoint.
    bot.stuckTimer += dt;
    if (bot.stuckTimer > 1) {
      bot.stuckTimer = 0;
      const moved = bot.position.distanceTo(bot.lastProgress);
      bot.lastProgress.copy(bot.position);
      if (moved < 0.1 && bot.path.length > 0) {
        bot.path = [];
        bot.state = 'patrol';
      }
    }
  }

  return {
    bots,
    hitMeshes,
    spawn(random, sableSpawns, vultureSpawns) {
      spawnBots(random, sableSpawns, vultureSpawns);
    },
    reset(sableSpawns, vultureSpawns) {
      const spawns = { sable: sableSpawns, vulture: vultureSpawns };
      let sableIndex = 0;
      let vultureIndex = 0;
      for (const bot of bots) {
        const list = spawns[bot.team];
        const spawn = list[bot.team === 'sable' ? sableIndex++ % list.length : vultureIndex++ % list.length];
        bot.position.copy(spawn);
        bot.position.y = 0;
        bot.health = BOT_HEALTH;
        bot.alive = true;
        bot.state = 'patrol';
        bot.path = [];
        bot.pathIndex = 0;
        bot.target = null;
        bot.fall = 0;
        bot.channel = 0;
        bot.channelKind = null;
        bot.carryingBomb = false;
        bot.yaw = bot.team === 'vulture' ? Math.PI : 0;
        bot.group.rotation.set(0, bot.yaw, 0);
        bot.group.position.copy(bot.position);
      }
    },
    step(dt, time, ctx, random) {
      for (const bot of bots) stepBot(bot, dt, time, ctx, random);
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.group.position.copy(bot.position);
        bot.group.rotation.y = bot.yaw;
      }
    },
    hearShot(position) {
      for (const bot of bots) hearShot(bot, position);
    },
    damageBot,
    aliveCount(team) {
      return bots.filter((bot) => bot.team === team && bot.alive).length;
    },
    carryingBot() {
      return bots.find((bot) => bot.carryingBomb) ?? null;
    },
  };
}
