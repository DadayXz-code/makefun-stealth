// Procedural WebAudio sound: no audio files, every effect is a short oscillator
// or noise burst shaped by a gain envelope. The context is created lazily on
// the first user gesture (browsers block audio before one) and stays muted
// until then; M toggles it.

export function createAudio() {
  let context = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (context !== null) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted || context === null || master === null) return;
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  function noise(dur, vol, low) {
    if (!ensure() || muted || context === null || master === null) return;
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const len = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, len, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = context.createBufferSource();
    src.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low ?? 1200;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(now);
  }

  return {
    /** Call from a user gesture so the browser lets audio start. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    footstep(run) {
      noise(run ? 0.09 : 0.06, run ? 0.22 : 0.1, run ? 900 : 500);
    },
    pebble() {
      tone(1400, 0.08, 'sine', 0.25, 900);
      noise(0.05, 0.12, 3000);
    },
    ring() {
      tone(880, 0.5, 'sine', 0.16, 660);
      tone(1320, 0.35, 'sine', 0.08, 990);
    },
    pickup() {
      tone(660, 0.12, 'sine', 0.22, 990);
      tone(990, 0.18, 'sine', 0.18, 1320);
    },
    suspect() {
      tone(520, 0.16, 'square', 0.1, 520);
    },
    alarm() {
      tone(440, 0.4, 'sawtooth', 0.16, 880);
      tone(880, 0.4, 'sawtooth', 0.1, 440);
    },
    laser() {
      tone(180, 0.3, 'sawtooth', 0.2, 90);
      noise(0.15, 0.15, 2000);
    },
    caught() {
      tone(220, 0.5, 'sawtooth', 0.22, 55);
    },
    clear() {
      tone(523, 0.14, 'sine', 0.2);
      tone(659, 0.14, 'sine', 0.2);
      tone(784, 0.3, 'sine', 0.22);
    },
    win() {
      tone(523, 0.16, 'sine', 0.2);
      tone(659, 0.16, 'sine', 0.2);
      tone(784, 0.16, 'sine', 0.2);
      tone(1047, 0.5, 'sine', 0.22);
    },
  };
}
