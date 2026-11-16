// Synthesised sound, no audio files: every effect is a short oscillator burst through
// one shared AudioContext, created lazily on the first user gesture. Nothing plays in
// a ?shot= capture, where there is no gesture.
export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function blip(frequency, duration, type, gainValue, slideTo) {
    if (!ensure() || context.state === 'suspended') return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    shot() {
      blip(190, 0.09, 'square', 0.5, 60);
    },
    distantShot() {
      blip(120, 0.12, 'square', 0.2, 50);
    },
    hit() {
      blip(1150, 0.05, 'sine', 0.5);
    },
    kill() {
      blip(880, 0.07, 'sine', 0.5);
      blip(1320, 0.09, 'sine', 0.4);
    },
    hurt() {
      blip(90, 0.16, 'sawtooth', 0.5, 55);
    },
    reload() {
      blip(520, 0.05, 'triangle', 0.35);
    },
    plantTick() {
      blip(980, 0.05, 'sine', 0.45);
    },
    beep() {
      blip(740, 0.09, 'sine', 0.5);
    },
    roundEnd(won) {
      blip(won ? 523 : 392, 0.14, 'triangle', 0.5);
      setTimeout(() => blip(won ? 784 : 311, 0.2, 'triangle', 0.5), 140);
    },
  };
}
