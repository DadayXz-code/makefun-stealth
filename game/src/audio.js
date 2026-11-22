// Procedural sound: no audio files, just a few WebAudio blips. Created lazily on the
// first user gesture so browsers allow it; every call is safe before that.
export function createAudio() {
  let context = null;
  let muted = false;

  function ensure() {
    if (!context) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        context = new AudioContext();
      } catch {
        context = null;
      }
    }
    if (context && context.state === 'suspended') context.resume();
    return context;
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = 0) {
    const ctx = ensure();
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    footstep() {
      tone(140, 0.05, 'sine', 0.045);
    },
    // Soft ticks that get louder as a guard walks near: the sound tells you where he is.
    guardStep(distance) {
      const gain = Math.max(0.008, 0.075 * (1 - distance / 260));
      tone(95, 0.06, 'triangle', gain);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.09);
      tone(990, 0.14, 'sine', 0.09, 0.08);
    },
    pebble() {
      tone(1200, 0.05, 'square', 0.05, 0, 500);
    },
    suspicious() {
      tone(520, 0.12, 'square', 0.06, 0, 760);
    },
    alarm() {
      tone(392, 0.16, 'sawtooth', 0.08);
      tone(311, 0.2, 'sawtooth', 0.08, 0.15);
    },
    caught() {
      tone(220, 0.3, 'sawtooth', 0.1, 0, 110);
    },
    laser() {
      tone(880, 0.1, 'square', 0.06, 0, 440);
    },
    levelClear() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'sine', 0.09, i * 0.09));
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'sine', 0.09, i * 0.11));
    },
  };
}
