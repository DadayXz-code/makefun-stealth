// Ghostline boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves between
// five screens: title, play, paused, level clear, game over and win.
//
// ?seed=N fixes the patrol pattern. ?shot=start|play|alert|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALARM, EVENT_CAUGHT, EVENT_CLEAR, EVENT_LASER, EVENT_OVER, EVENT_PEBBLE, EVENT_PICKUP, EVENT_SUSPECT, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_PEBBLE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
if (params.get('debug')) window.__ghost = world;
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const game = world;
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let stepSoundTimer = 0;

  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'm') audio.toggleMute();
  });

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    input.resetSneak();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Lift the intel, reach the exit, stay unseen.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.score > best) {
      best = world.score;
      saveBest(best);
    }
    announce(`Caught. Score ${world.score}. Best ${best}.`);
  }

  function winGame() {
    screen = SCREEN_WIN;
    if (world.score > best) {
      best = world.score;
      saveBest(best);
    }
    announce(`Ghost. Final score ${world.score}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_SUSPECT) audio.suspicious();
    if (events & EVENT_ALARM) audio.alarm();
    if (events & EVENT_CAUGHT) audio.caught();
    if (events & EVENT_LASER) audio.laser();
    if (events & EVENT_PEBBLE) audio.pebble();
    if (events & EVENT_CLEAR) {
      audio.levelClear();
      screen = SCREEN_CLEAR;
      announce('Level clear. Press Space for the next level.');
    }
    if (events & EVENT_WIN) {
      audio.win();
      winGame();
    }
    if (events & EVENT_OVER) endGame();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_CLEAR) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_PEBBLE && screen === SCREEN_PLAY) {
      const events = world.step(0, { x: 0, y: 0, run: false, sneak: false }, EVENT_PEBBLE);
      handleEvents(events);
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const dir = input.direction();
    const events = world.step(STEP, { x: dir.x, y: dir.y, run: input.running(), sneak: input.sneaking() }, 0);
    handleEvents(events);
    // Footsteps: yours when you move, a guard's when he walks close by.
    stepSoundTimer -= STEP;
    if (stepSoundTimer <= 0) {
      const p = world.state.player;
      if (p.moving && !p.sneaking) {
        audio.footstep();
        stepSoundTimer = p.running ? 0.22 : 0.34;
      } else {
        stepSoundTimer = 0.1;
      }
      let nearest = Infinity;
      for (const guard of world.state.guards) {
        if (guard.stepped) {
          const d = Math.hypot(guard.x - p.x, guard.y - p.y);
          if (d < nearest) nearest = d;
        }
      }
      if (nearest < 260) audio.guardStep(nearest);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(game, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Ghostline. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
