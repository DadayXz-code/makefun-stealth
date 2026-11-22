// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play,
// paused, level clear, game over and win.
//
// ?seed=N fixes the random pattern. ?shot=start|play|alert|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_ALARM,
  EVENT_CAUGHT,
  EVENT_CLEAR,
  EVENT_INTEL,
  EVENT_LASER,
  EVENT_OVER,
  EVENT_PEBBLE,
  EVENT_SUSPECT,
  EVENT_WIN,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PEBBLE, createInput } from './input.js';
import { createRenderer, SCREEN_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How long the level-clear panel stays up before play resumes on its own. */
const CLEAR_HOLD = 3;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const IDLE = { x: 0, y: 0, run: false, sneak: false };

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
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let clearTimer = 0;
  let stepDistance = 0;
  let hadPebble = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each catch.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    stepDistance = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. ${LIVES} lives. Lift every intel file, then reach the exit.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.score > best) {
      best = world.score;
      saveBest(best);
    }
    announce(`Caught. Game over. Score ${world.score}. Best ${best}.`);
  }

  function winGame() {
    screen = SCREEN_WIN;
    if (world.score > best) {
      best = world.score;
      saveBest(best);
    }
    announce(`Ghostline complete. Final score ${world.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_CLEAR) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (actions & ACTION_PEBBLE && screen === SCREEN_PLAY) {
      // A pebble is thrown with a zero-time step: the world only throws on
      // EVENT_PEBBLE, so the action must reach it as the step's actions flag.
      const thrown = world.step(0, { x: 0, y: 0, run: false, sneak: false }, EVENT_PEBBLE);
      if (thrown & EVENT_PEBBLE) audio.pebble();
    }
  }

  function handleEvents(events) {
    if (events & EVENT_INTEL) audio.pickup();
    if (events & EVENT_SUSPECT) audio.suspect();
    if (events & EVENT_ALARM) audio.alarm();
    if (events & EVENT_LASER) audio.laser();
    if (events & EVENT_CAUGHT) {
      audio.caught();
      announce(world.lives === 1 ? 'Caught. 1 life left.' : `Caught. ${world.lives} lives left.`);
    }
    if (events & EVENT_WIN) {
      audio.win();
      winGame();
    } else if (events & EVENT_CLEAR) {
      audio.clear();
      screen = SCREEN_CLEAR;
      clearTimer = CLEAR_HOLD;
      announce(`Level clear. Score ${world.score}.`);
    } else if (events & EVENT_OVER) {
      endGame();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, IDLE, 0);
      return;
    }
    const before = { x: world.state.player.x, y: world.state.player.y };
    const vector = input.vector();
    const events = world.step(STEP, vector, 0);
    if (world.world.pebble === null && hadPebble) audio.ring();
    hadPebble = world.world.pebble !== null;
    const moved = Math.hypot(world.state.player.x - before.x, world.state.player.y - before.y);
    if (moved > 0.5) {
      stepDistance += moved;
      if (stepDistance >= 34) {
        stepDistance = 0;
        audio.footstep(vector.run);
      }
    }
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += frameDt;
    last = now;
    handleActions();
    if (screen === SCREEN_CLEAR) {
      clearTimer -= frameDt;
      if (clearTimer <= 0) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
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
