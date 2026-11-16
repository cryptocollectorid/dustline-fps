// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, kill feed,
// bomb status, buy menu and the one overlay panel. It never touches the simulation;
// main.js pushes numbers in and reads the play / buy callbacks out.
import { BUY_ITEMS } from './economy.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const vignette = $('vignette');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { hp: -1, mag: -1, reserve: -1, money: -1, timer: '', sable: -1, vulture: -1, round: -1, aliveS: -1, aliveV: -1 };

  function formatTime(seconds) {
    const value = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(hp, kevlar) {
      if (hp === last.hp) return;
      last.hp = hp;
      $('health-num').textContent = String(Math.max(0, Math.round(hp)));
      const bar = document.querySelector('#health-bar i');
      bar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      bar.classList.toggle('low', hp <= 30);
      $('kevlar').hidden = !kevlar;
    },
    setAmmo(mag, reserve, weaponName, grenades) {
      if (mag === last.mag && reserve === last.reserve) return;
      last.mag = mag;
      last.reserve = reserve;
      $('ammo-mag').textContent = String(mag);
      $('ammo-reserve').textContent = `/ ${reserve}`;
      $('ammo').classList.toggle('empty', mag === 0);
      $('weapon-name').textContent = weaponName;
      $('grenades').textContent = grenades > 0 ? `Grenades: ${grenades} (G)` : '';
    },
    setMoney(amount) {
      if (amount === last.money) return;
      last.money = amount;
      $('money').textContent = `$${amount}`;
    },
    setTimer(seconds, phase) {
      const text = formatTime(seconds);
      if (text === last.timer) return;
      last.timer = text;
      const timer = $('timer');
      timer.textContent = text;
      timer.classList.toggle('low', seconds <= 10 && phase === 'live');
      $('round-label').textContent = phase === 'buy' ? 'BUY PHASE' : phase === 'live' ? `ROUND ${last.round}` : phase === 'roundEnd' ? 'ROUND OVER' : phase === 'matchEnd' ? 'MATCH OVER' : '';
    },
    setScore(sable, vulture, round) {
      if (sable === last.sable && vulture === last.vulture && round === last.round) return;
      last.sable = sable;
      last.vulture = vulture;
      last.round = round;
      $('score-sable').textContent = String(sable);
      $('score-vulture').textContent = String(vulture);
      $('round-label').textContent = `ROUND ${round}`;
    },
    setAlive(sable, vulture) {
      if (sable === last.aliveS && vulture === last.aliveV) return;
      last.aliveS = sable;
      last.aliveV = vulture;
      $('alive-sable').textContent = String(sable);
      $('alive-vulture').textContent = String(vulture);
    },
    killFeed(text) {
      const feed = $('killfeed');
      const line = document.createElement('div');
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    setBombStatus(text, urgent) {
      const element = $('bomb-status');
      if (!text) {
        element.hidden = true;
        return;
      }
      element.hidden = false;
      element.textContent = text;
      element.classList.toggle('urgent', Boolean(urgent));
    },
    setChannel(label, fraction) {
      const channel = $('channel');
      if (!label) {
        channel.hidden = true;
        return;
      }
      channel.hidden = false;
      $('channel-label').textContent = label;
      document.querySelector('#channel-bar i').style.width = `${Math.round(fraction * 100)}%`;
    },
    setHint(text) {
      const hint = $('hint');
      hint.hidden = !text;
      hint.textContent = text ?? '';
    },
    setCrosshairSpread(spread) {
      crosshair.style.setProperty('--gap', `${Math.round(6 + spread * 900)}px`);
    },
    hitMarker(killed) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.classList.remove('kill');
      }, killed ? 160 : 90);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 140);
    },
    banner(titleText, subText, holdMs = 2200) {
      const banner = $('banner');
      $('banner-title').textContent = titleText;
      $('banner-sub').textContent = subText ?? '';
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() {
      $('banner').hidden = true;
    },
    showBuyMenu(money, ownedWeapons, ownedGrenades) {
      const menu = $('buy-menu');
      const items = $('buy-items');
      items.innerHTML = '';
      const keys = ['1', '2', '3', '4'];
      BUY_ITEMS.forEach((item, index) => {
        const owned = item.key === 'rifle' || item.key === 'smg' ? ownedWeapons.includes(item.key) : item.key === 'grenade' ? ownedGrenades > 0 : false;
        const row = document.createElement('div');
        row.className = `buy-item${owned ? ' owned' : ''}`;
        row.dataset.key = item.key;
        row.innerHTML = `<span><span class="key">[${keys[index]}]</span><span class="name">${item.name}</span><br><span class="desc">${item.desc}</span></span><span class="price">$${item.price}</span>`;
        items.appendChild(row);
      });
      $('buy-money').textContent = `Wallet: $${money}`;
      menu.hidden = false;
    },
    hideBuyMenu() {
      $('buy-menu').hidden = true;
    },
    onBuy(handler) {
      $('buy-items').addEventListener('click', (event) => {
        const row = event.target.closest('.buy-item');
        if (row) handler(row.dataset.key);
      });
    },
    showOverlay(mode, scoreText) {
      const copyText = {
        start: 'A tactical FPS in a dusk freight yard. You are SABLE, the attackers: plant the bomb at Site A, or eliminate the VULTURE defenders. First to 5 rounds takes the match.',
        paused: 'Paused. Click to resume.',
        roundEnd: scoreText ?? '',
        matchEnd: scoreText ?? '',
      };
      const titles = { start: 'DUSTLINE', paused: 'DUSTLINE', roundEnd: 'ROUND OVER', matchEnd: 'MATCH OVER' };
      const actions = { start: 'Click to play', paused: 'Click to resume', roundEnd: 'Next round', matchEnd: 'Play again' };
      title.textContent = titles[mode];
      copy.textContent = copyText[mode];
      play.textContent = actions[mode];
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
