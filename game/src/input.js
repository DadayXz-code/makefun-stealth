// Keyboard input: held keys become a movement vector each frame; presses become
// one-shot actions the world consumes (confirm, pause, sneak toggle, throw pebble).
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_PEBBLE = 4;

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  let sneak = false;

  function keyOf(event) {
    const key = event.key.toLowerCase();
    return key === ' ' ? 'space' : key;
  }

  function onKeyDown(event) {
    const key = keyOf(event);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space'].includes(key)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    held.add(key);
    if (key === 'space' || key === 'enter') queued |= ACTION_CONFIRM;
    if (key === 'p' || key === 'escape') queued |= ACTION_PAUSE;
    if (key === 'q') queued |= ACTION_PEBBLE;
    if (key === 'c') sneak = !sneak;
  }

  function onKeyUp(event) {
    held.delete(keyOf(event));
  }

  function onBlur() {
    held.clear();
  }

  function onPointerDown() {
    queued |= ACTION_CONFIRM;
  }

  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.tabIndex = 0;

  return {
    // Normalised -1..1 movement vector from WASD / arrows.
    direction() {
      let x = 0;
      let y = 0;
      if (held.has('a') || held.has('arrowleft')) x -= 1;
      if (held.has('d') || held.has('arrowright')) x += 1;
      if (held.has('w') || held.has('arrowup')) y -= 1;
      if (held.has('s') || held.has('arrowdown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.hypot(x, y);
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    running() {
      return held.has('shift');
    },
    sneaking() {
      return sneak || held.has('control');
    },
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
    resetSneak() {
      sneak = false;
    },
  };
}
