// DUSTLINE: a round-based tactical FPS. One fixed-step simulation (60 Hz) apart from
// rendering; one state store (the `game` object) that every module reads and writes.
// SABLE (the player + two bots) attacks, VULTURE (three bots) defends Site A.
// A round is won by eliminating the enemy team, or by planting the bomb and letting
// the fuse run out. First to 5 rounds takes the match.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createWeaponRig, createGrenades, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, FUSE_SECONDS } from './bomb.js';
import { createEconomy, BUY_ITEMS, REWARDS } from './economy.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { mulberry32, range } from './rng.js';
import { PALETTE } from './palette.js';

const STEP = 1 / 60;
const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const ROUND_END_SECONDS = 4;
const WIN_ROUNDS = 5;
const PLANT_SECONDS = 2;
const PLAYER_HEALTH = 100;

export function main() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') ?? 1);
  const shotName = params.get('shot');
  const random = mulberry32(seed);

  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(new THREE.Color(0x2a2118), 26, 62);
  const camera = new THREE.PerspectiveCamera(78, 1, 0.08, 120);
  scene.add(camera);

  const world = createWorld(scene);
  const player = createPlayer(world.colliders);
  const hud = createHud();
  const audio = createAudio();
  const economy = createEconomy();
  const rig = createWeaponRig(camera);
  const grenades = createGrenades(scene, world.colliders);
  const bomb = createBomb(scene);
  const raycaster = new THREE.Raycaster();

  const game = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    score: { sable: 0, vulture: 0 },
    phaseTimer: 0,
    time: 0,
    playerHealth: PLAYER_HEALTH,
    playerAlive: true,
    playerDiedLastRound: false,
    ownedWeapons: ['pistol'],
    plantProgress: 0,
    roundWinner: null,
    roundReason: '',
    deadCam: 0,
  };

  // Tracers: a small reusable pool of fading lines, one per shot.
  const tracers = [];
  for (let i = 0; i < 10; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;
  const tempVector = new THREE.Vector3();
  const tempVector2 = new THREE.Vector3();
  const tempVector3 = new THREE.Vector3();

  function spawnTracer(from, to, color) {
    const entry = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const positions = entry.line.geometry.getAttribute('position');
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    entry.line.material.color.set(color);
    entry.line.material.opacity = 0.9;
    entry.life = 0.07;
  }

  function stepTracers(dt) {
    for (const entry of tracers) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      entry.line.material.opacity = Math.max(0, entry.life / 0.07) * 0.9;
    }
  }

  function muzzleWorld(out) {
    return camera.localToWorld(out.set(0.24, -0.18, -0.95));
  }

  // --- bots ---------------------------------------------------------------
  const bots = createBots(scene, world, {
    onBotShot(bot, from, to) {
      spawnTracer(from, to, 0xf5d9a8);
      audio.distantShot();
    },
    onBotHitPlayer(damage) {
      damagePlayer(damage);
    },
    onBotKilled(bot, attacker) {
      const killer = attacker === player.state ? 'You' : attacker.name ?? 'A bot';
      hud.killFeed(`${killer} eliminated ${bot.name} (${bot.team.toUpperCase()})`);
      if (attacker === player.state) {
        economy.reward(REWARDS.kill);
        hud.setMoney(economy.state.money);
        audio.kill();
      }
      checkRoundEnd();
    },
    onBombDropped(position) {
      bomb.drop(position);
      hud.setBombStatus('BOMB DROPPED — walk over it to pick it up', false);
    },
    onBombPickedUp(bot) {
      bomb.pickUp();
      hud.killFeed(`${bot.name} picked up the bomb`);
      hud.setBombStatus('ALLY CARRIES THE BOMB', false);
    },
    onBombPlanted(bot) {
      bomb.plant(bot.position);
      economy.reward(REWARDS.plant);
      hud.setBombStatus(`BOMB PLANTED — ${FUSE_SECONDS}s`, true);
      hud.killFeed(`${bot.name} planted the bomb at Site A`);
      audio.beep();
    },
    onBombDefused(bot) {
      bomb.defuse();
      endRound('vulture', `${bot.name} defused the bomb`);
    },
  });

  function damagePlayer(amount) {
    if (!game.playerAlive || game.phase !== 'live') return;
    const reduced = economy.state.kevlar ? amount * 0.7 : amount;
    game.playerHealth -= reduced;
    hud.damageFlash();
    audio.hurt();
    hud.setHealth(game.playerHealth, economy.state.kevlar);
    if (game.playerHealth <= 0) {
      game.playerHealth = 0;
      game.playerAlive = false;
      game.playerDiedLastRound = true;
      game.deadCam = 0;
      hud.killFeed('You were eliminated');
      if (bomb.state.status === 'carried') {
        bomb.drop(player.state.position);
        hud.setBombStatus('BOMB DROPPED — an ally can pick it up', false);
      }
      checkRoundEnd();
    }
  }

  function damageBot(bot, amount, part, distance) {
    if (!bot.alive) return;
    const falloff = Math.max(0.5, 1 - (distance / 80) * 0.5);
    const total = Math.round(amount * (part === 'head' ? 4 : 1) * falloff);
    bots.damageBot(bot, total, player.state);
    hud.hitMarker(!bot.alive);
    if (!bot.alive) audio.kill();
    else audio.hit();
  }

  function shoot() {
    if (!rig.ready()) return;
    if (!rig.takeRound()) {
      rig.reload();
      return;
    }
    rig.pullTrigger();
    audio.shot();
    const def = rig.currentDef();
    const spread = rig.spread(player.groundSpeed());
    camera.getWorldDirection(tempVector);
    tempVector2.crossVectors(tempVector, camera.up).normalize();
    tempVector3.crossVectors(tempVector2, tempVector).normalize();
    const direction = tempVector.clone()
      .addScaledVector(tempVector2, range(random, -spread, spread))
      .addScaledVector(tempVector3, range(random, -spread, spread))
      .normalize();
    raycaster.set(camera.position, direction);
    raycaster.far = def.range;
    const targets = [...world.shootables, ...bots.hitMeshes];
    const hits = raycaster.intersectObjects(targets, false);
    const muzzle = muzzleWorld(new THREE.Vector3());
    let end;
    if (hits.length === 0) {
      end = camera.position.clone().addScaledVector(direction, def.range);
    } else {
      const hit = hits[0];
      end = hit.point.clone();
      if (hit.object.userData.bot) {
        damageBot(hit.object.userData.bot, def.damage, hit.object.userData.part, hit.distance);
      }
    }
    spawnTracer(muzzle, end, PALETTE.accent);
    player.recoil(0.011 + spread * 0.35, range(random, -0.004, 0.004));
    bots.hearShot(camera.position);
  }

  function explodeGrenade(explosion) {
    const origin = explosion.position;
    const playerDistance = player.state.position.distanceTo(origin);
    if (game.playerAlive && playerDistance < explosion.radius) {
      const amount = explosion.damage * (1 - playerDistance / explosion.radius);
      damagePlayer(amount);
    }
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const distance = bot.position.distanceTo(origin);
      if (distance < explosion.radius) {
        bots.damageBot(bot, Math.round(explosion.damage * (1 - distance / explosion.radius)), player.state);
      }
    }
    audio.distantShot();
  }

  function checkRoundEnd() {
    if (game.phase !== 'live') return;
    const sableAlive = (game.playerAlive ? 1 : 0) + bots.aliveCount('sable');
    const vultureAlive = bots.aliveCount('vulture');
    if (vultureAlive === 0) endRound('sable', 'VULTURE team eliminated');
    else if (sableAlive === 0 && bomb.state.status !== 'planted') endRound('vulture', 'SABLE team eliminated');
  }

  function endRound(winner, reason) {
    if (game.phase !== 'live') return;
    game.phase = 'roundEnd';
    game.phaseTimer = ROUND_END_SECONDS;
    game.roundWinner = winner;
    game.roundReason = reason;
    game.score[winner] += 1;
    economy.reward(winner === 'sable' ? REWARDS.roundWin : REWARDS.roundLoss);
    hud.setScore(game.score.sable, game.score.vulture, game.round);
    hud.setMoney(economy.state.money);
    hud.hideBuyMenu();
    hud.setChannel(null);
    hud.setBombStatus(null);
    const won = winner === 'sable';
    hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason, ROUND_END_SECONDS * 1000);
    audio.roundEnd(won);
  }

  function startRound() {
    game.phase = 'buy';
    game.phaseTimer = BUY_SECONDS;
    game.playerHealth = PLAYER_HEALTH;
    game.playerAlive = true;
    game.plantProgress = 0;
    game.deadCam = 0;
    economy.resetRound();
    if (game.playerDiedLastRound) {
      rig.resetToPistol();
      game.ownedWeapons = ['pistol'];
      game.playerDiedLastRound = false;
    }
    player.reset(0, 12, 0);
    bots.reset(world.sableSpawns, world.vultureSpawns);
    bomb.reset();
    hud.setHealth(game.playerHealth, false);
    hud.setScore(game.score.sable, game.score.vulture, game.round);
    hud.setMoney(economy.state.money);
    hud.setBombStatus('PLANT THE BOMB AT SITE A', false);
    hud.hideBanner();
    hud.showBuyMenu(economy.state.money, game.ownedWeapons, rig.state.grenades);
    hud.setHint('Press B to buy — round starts in 15 s');
  }

  function startMatch() {
    game.score = { sable: 0, vulture: 0 };
    game.round = 1;
    economy.resetMatch();
    game.ownedWeapons = ['pistol'];
    rig.resetToPistol();
    startRound();
  }

  function nextRound() {
    if (game.score.sable >= WIN_ROUNDS || game.score.vulture >= WIN_ROUNDS) {
      game.phase = 'matchEnd';
      const won = game.score.sable >= WIN_ROUNDS;
      hud.showOverlay('matchEnd', won
        ? `SABLE wins the match ${game.score.sable}–${game.score.vulture}. Dustline is yours.`
        : `VULTURE wins the match ${game.score.vulture}–${game.score.sable}. The yard holds.`);
      return;
    }
    game.round += 1;
    startRound();
  }

  // --- input --------------------------------------------------------------
  const input = createInput(canvas, (locked) => {
    if (!locked && game.phase === 'live') hud.showOverlay('paused');
  });

  hud.onPlay(() => {
    audio.unlock();
    if (game.phase === 'menu') {
      startMatch();
      hud.hideOverlay();
      input.requestLock();
    } else if (game.phase === 'paused') {
      game.phase = 'live';
      hud.hideOverlay();
      input.requestLock();
    } else if (game.phase === 'roundEnd') {
      hud.hideOverlay();
      nextRound();
      input.requestLock();
    } else if (game.phase === 'matchEnd') {
      startMatch();
      hud.hideOverlay();
      input.requestLock();
    }
  });

  hud.onBuy((key) => {
    if (game.phase !== 'buy') return;
    buyByKey(key);
  });

  function toggleBuyMenu() {
    if (game.phase !== 'buy') return;
    if (document.getElementById('buy-menu').hidden) {
      hud.showBuyMenu(economy.state.money, game.ownedWeapons, rig.state.grenades);
    } else {
      hud.hideBuyMenu();
    }
  }

  // --- fixed step -----------------------------------------------------------
  function step(dt) {
    game.time += dt;
    const pressed = input.takePressed();
    const look = input.takeLook();
    if (game.phase === 'live' || game.phase === 'buy') {
      if (input.state.locked) player.look(look.x, look.y);
    }

    if (game.phase === 'buy') {
      game.phaseTimer -= dt;
      if (pressed.has('KeyB')) toggleBuyMenu();
      if (pressed.has('Digit1')) buyByKey('rifle');
      if (pressed.has('Digit2')) buyByKey('smg');
      if (pressed.has('Digit3')) buyByKey('grenade');
      if (pressed.has('Digit4')) buyByKey('kevlar');
      if (game.phaseTimer <= 0) {
        game.phase = 'live';
        game.phaseTimer = ROUND_SECONDS;
        hud.hideBuyMenu();
        hud.setHint(null);
      }
    }

    if (game.phase === 'live') {
      game.phaseTimer -= dt;
      if (game.phaseTimer <= 0 && bomb.state.status !== 'planted') {
        endRound('vulture', 'Time expired — the bomb was never planted');
      }

      if (game.playerAlive) {
        player.step(dt, input.state.keys);
        if (pressed.has('KeyR')) {
          if (rig.reload()) audio.reload();
        }
        if (pressed.has('Digit1')) rig.switchTo('pistol');
        if (pressed.has('Digit2') && game.ownedWeapons.includes('rifle')) rig.switchTo('rifle');
        if (pressed.has('Digit3') && game.ownedWeapons.includes('smg')) rig.switchTo('smg');
        if (pressed.has('KeyG') && rig.state.grenades > 0) {
          rig.state.grenades -= 1;
          camera.getWorldDirection(tempVector);
          grenades.throwGrenade(camera.position.clone().addScaledVector(tempVector, 0.5), tempVector.clone());
          audio.shot();
        }
        if (input.state.firing && rig.currentDef().auto) shoot();
        else if (input.takeClicked()) shoot();
        if (pressed.has('KeyB')) hud.setHint('Buy phase is over — B opens the shop next round');
      }

      // Planting: hold E inside Site A while carrying the bomb.
      const inSite = player.state.position.distanceTo(world.siteA.center) < world.siteA.radius;
      if (game.playerAlive && bomb.state.status === 'carried' && inSite && input.state.keys.has('KeyE')) {
        game.plantProgress += dt / PLANT_SECONDS;
        hud.setChannel('PLANTING THE BOMB', game.plantProgress);
        if (game.plantProgress >= 1) {
          bomb.plant(player.state.position);
          economy.reward(REWARDS.plant);
          hud.setMoney(economy.state.money);
          hud.setChannel(null);
          hud.setBombStatus(`BOMB PLANTED — ${FUSE_SECONDS}s`, true);
          hud.killFeed('You planted the bomb at Site A');
          audio.beep();
        }
      } else {
        if (game.plantProgress > 0) game.plantProgress = Math.max(0, game.plantProgress - dt / PLANT_SECONDS);
        if (game.plantProgress === 0) hud.setChannel(null);
        else hud.setChannel('PLANTING THE BOMB', game.plantProgress);
      }

      // Bomb pickup: walk over a dropped bomb.
      if (game.playerAlive && bomb.state.status === 'dropped') {
        const distance = player.state.position.distanceTo(bomb.state.position);
        if (distance < 1.4) {
          bomb.pickUp();
          hud.setBombStatus('PLANT THE BOMB AT SITE A', false);
          hud.killFeed('You picked up the bomb');
        }
      }

      const bombEvent = bomb.step(dt);
      if (bombEvent === 'beep') audio.plantTick();
      if (bombEvent === 'explode') {
        bomb.explode();
        endRound('sable', 'The bomb detonated at Site A');
      }
      if (bomb.state.status === 'planted') {
        hud.setBombStatus(`BOMB PLANTED — ${Math.ceil(bomb.state.fuse)}s`, bomb.state.fuse <= 10);
      }

      for (const explosion of grenades.step(dt)) explodeGrenade(explosion);
      rig.step(dt);

      const ctx = {
        playerPos: player.state.position,
        playerAlive: game.playerAlive,
        playerCrouching: player.state.crouching,
        playerSpeed: player.groundSpeed(),
        bomb: { state: bomb.state.status, position: bomb.state.position },
      };
      bots.step(dt, game.time, ctx, random);
    }

    if (game.phase === 'roundEnd') {
      game.phaseTimer -= dt;
      rig.step(dt);
      const ctx = {
        playerPos: player.state.position,
        playerAlive: game.playerAlive,
        playerCrouching: player.state.crouching,
        playerSpeed: 0,
        bomb: { state: bomb.state.status, position: bomb.state.position },
      };
      bots.step(dt, game.time, ctx, random);
      if (game.phaseTimer <= 0) {
        hud.hideOverlay();
        nextRound();
      }
    }

    // Camera follows the player; on death it sinks to the ground.
    if (game.playerAlive) {
      camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(player.state.pitch, player.state.yaw, 0);
    } else {
      game.deadCam = Math.min(1, game.deadCam + dt * 2);
      camera.position.y += (0.5 - camera.position.y) * Math.min(1, dt * 2);
    }

    hud.setAmmo(rig.state.mag, rig.state.reserve, rig.currentDef().name, rig.state.grenades);
    hud.setHealth(game.playerHealth, economy.state.kevlar);
    hud.setAlive((game.playerAlive ? 1 : 0) + bots.aliveCount('sable'), bots.aliveCount('vulture'));
    hud.setCrosshairSpread(rig.spread(player.groundSpeed()));
    if (game.phase === 'buy' || game.phase === 'live') {
      hud.setTimer(game.phaseTimer, game.phase);
    }
    stepTracers(dt);
  }

  function buyByKey(key) {
    const item = BUY_ITEMS.find((entry) => entry.key === key);
    if (!item) return;
    const result = economy.buy(item);
    if (!result.ok) {
      hud.setHint(result.reason);
      return;
    }
    if (item.key === 'rifle' || item.key === 'smg') {
      rig.giveWeapon(item.key);
      game.ownedWeapons.push(item.key);
    } else if (item.key === 'grenade') {
      rig.addGrenades(1);
    }
    hud.setMoney(economy.state.money);
    hud.setAmmo(rig.state.mag, rig.state.reserve, rig.currentDef().name, rig.state.grenades);
    hud.showBuyMenu(economy.state.money, game.ownedWeapons, rig.state.grenades);
    hud.setHint(`${item.name} bought`);
  }

  // --- deterministic staged captures ----------------------------------------
  function syncCamera() {
    camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(player.state.pitch, player.state.yaw, 0);
  }

  function stageShot(name) {
    hud.hideOverlay();
    hud.hideBanner();
    if (name === 'start') {
      startMatch();
      player.reset(0, 12, 0);
    } else if (name === 'play') {
      startMatch();
      game.phase = 'live';
      game.phaseTimer = 87;
      hud.hideBuyMenu();
      hud.setHint(null);
      rig.giveWeapon('rifle');
      game.ownedWeapons = ['pistol', 'rifle'];
      player.reset(-15, 6, 0);
      player.state.pitch = -0.04;
      const ash = bots.bots.find((bot) => bot.name === 'Ash');
      ash.position.set(-15, 0, -6);
      ash.yaw = Math.PI;
      ash.group.position.copy(ash.position);
      ash.group.rotation.y = ash.yaw;
      syncCamera();
      shoot();
      rig.step(0);
    } else if (name === 'bomb') {
      startMatch();
      game.phase = 'live';
      game.phaseTimer = 41;
      hud.hideBuyMenu();
      hud.setHint(null);
      player.reset(11, -8, -0.6);
      player.state.pitch = 0.02;
      game.plantProgress = 0.62;
      hud.setChannel('PLANTING THE BOMB', 0.62);
      const kite = bots.bots.find((bot) => bot.name === 'Kite');
      kite.position.set(14, 0, -12.5);
      kite.yaw = Math.PI;
      kite.group.position.copy(kite.position);
      kite.group.rotation.y = kite.yaw;
    } else if (name === 'end') {
      startMatch();
      game.score = { sable: 1, vulture: 0 };
      game.round = 1;
      game.phase = 'roundEnd';
      game.phaseTimer = 3;
      hud.hideBuyMenu();
      hud.setHint(null);
      hud.setBombStatus(null);
      player.reset(-7, 0, 0.3);
      const ash = bots.bots.find((bot) => bot.name === 'Ash');
      ash.alive = false;
      ash.fall = 1;
      ash.group.rotation.x = -1.45;
      ash.group.position.y = -0.08;
      ash.position.set(-8, 0, -4);
      ash.group.position.set(-8, -0.08, -4);
      hud.setScore(1, 0, 1);
      hud.banner('ROUND WON', 'VULTURE team eliminated', 60000);
    }
    syncCamera();
    hud.setAmmo(rig.state.mag, rig.state.reserve, rig.currentDef().name, rig.state.grenades);
    hud.setHealth(game.playerHealth, economy.state.kevlar);
    hud.setMoney(economy.state.money);
    hud.setAlive((game.playerAlive ? 1 : 0) + bots.aliveCount('sable'), bots.aliveCount('vulture'));
    hud.setScore(game.score.sable, game.score.vulture, game.round);
    hud.setTimer(game.phaseTimer, game.phase);
    window.__shotReady = true;
  }

  // --- boot -------------------------------------------------------------------
  bots.spawn(random, world.sableSpawns, world.vultureSpawns);
  player.reset(0, 12, 0);
  camera.position.set(0, 1.6, 12);
  camera.rotation.set(0, 0, 0);

  // A read-only snapshot for debugging and automated play-tests.
  window.__dustline = {
    snapshot() {
      return {
        phase: game.phase,
        round: game.round,
        score: { ...game.score },
        phaseTimer: Math.round(game.phaseTimer * 10) / 10,
        player: {
          x: Math.round(player.state.position.x * 100) / 100,
          z: Math.round(player.state.position.z * 100) / 100,
          health: Math.round(game.playerHealth),
          alive: game.playerAlive,
          weapon: rig.currentDef().name,
          mag: rig.state.mag,
          reserve: rig.state.reserve,
          grenades: rig.state.grenades,
        },
        bots: bots.bots.map((bot) => ({
          name: bot.name, team: bot.team, alive: bot.alive,
          x: Math.round(bot.position.x * 100) / 100,
          z: Math.round(bot.position.z * 100) / 100,
          state: bot.state, health: Math.round(bot.health),
        })),
        bomb: bomb.state.status,
        money: economy.state.money,
      };
    },
  };

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  if (shotName) {
    // Staged capture: run the scene once, render, then signal readiness.
    stageShot(shotName);
    renderer.render(scene, camera);
    window.__dustline.debug = {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      sceneChildren: scene.children.length,
      camera: [camera.position.x, camera.position.y, camera.position.z],
    };
    return;
  }

  hud.showOverlay('start');
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      step(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

main();
