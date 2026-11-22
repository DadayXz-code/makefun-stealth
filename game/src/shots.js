// Screenshot scenes behind ?shot=start|play|alert|end. Each one plays the real rules
// forward from a fresh world, steered by a waypoint autopilot that freezes and sneaks
// whenever a guard starts to suspect it, so the frame is what a careful run really
// looks like — and the same seed always gives the same frame. The play scene then
// advances to the moment in the next patrol loop where the guards' cones read
// longest, so the shot shows the cones at their best.
import { STEP, TILE } from './config.js';
import { EVENT_CLEAR, EVENT_OVER, EVENT_WIN } from './world.js';
import { coneReach, SCREEN_CLEAR, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const SAMPLE = STEP;

/** Follow `waypoints` (tile coords) at fixed steps; freeze when a guard suspects. */
function runWaypoints(world, waypoints, maxSeconds, stopWhen, bold = false, sneakIdle = true) {
  let events = 0;
  let index = 0;
  let stuckTimer = 0;
  let lastX = world.state.player.x;
  let lastY = world.state.player.y;
  let elapsed = 0;
  const steps = Math.floor(maxSeconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const s = world.state;
    const maxSuspicion = Math.max(0, ...s.guards.map((g) => g.suspicion));
    const anyAlert = s.guards.some((g) => g.state === 'alert');
    let input = { x: 0, y: 0, run: false, sneak: false };
    if (index >= waypoints.length) {
      // Waypoints done: hold still until the stop condition or the cap.
      input = { x: 0, y: 0, run: false, sneak: sneakIdle };
    } else if (!bold && (maxSuspicion >= 38 || anyAlert)) {
      input = { x: 0, y: 0, run: false, sneak: true };
    } else {
      const [tx, ty] = waypoints[index];
      const wx = (tx + 0.5) * TILE;
      const wy = (ty + 0.5) * TILE;
      const dx = wx - s.player.x;
      const dy = wy - s.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) {
        index += 1;
      } else {
        input = { x: dx / d, y: dy / d, run: false, sneak: false };
      }
    }
    events |= world.step(SAMPLE, input, 0);
    elapsed += SAMPLE;
    if (stopWhen && stopWhen(world, events)) break;
    if (events & (EVENT_CLEAR | EVENT_WIN | EVENT_OVER)) break;
    if (Math.hypot(s.player.x - lastX, s.player.y - lastY) < 0.5) {
      stuckTimer += SAMPLE;
      if (stuckTimer > 2 && index < waypoints.length) {
        index += 1;
        stuckTimer = 0;
      }
    } else {
      stuckTimer = 0;
    }
    lastX = s.player.x;
    lastY = s.player.y;
  }
  return { events, reached: index, elapsed };
}

function patrolOnly(world, seconds) {
  for (let i = 0; i < seconds / SAMPLE; i += 1) {
    world.step(SAMPLE, { x: 0, y: 0, run: false, sneak: false }, 0);
  }
}

// How readable the guards' cones are right now: the summed ray length of every cone.
function coneScore(world) {
  if (world.status !== 'play') return -1;
  let total = 0;
  for (const guard of world.state.guards) total += coneReach(world, guard);
  return total;
}

/** Advance with the player standing still; return the best-scoring extra time. */
function bestConeMoment(world, maxSeconds) {
  const lives = world.lives;
  let bestTime = 0;
  let bestScore = coneScore(world);
  let t = 0;
  while (t < maxSeconds) {
    world.step(0.25, { x: 0, y: 0, run: false, sneak: true }, 0);
    t += 0.25;
    if (world.lives !== lives || world.status !== 'play') break;
    const score = coneScore(world);
    if (score > bestScore) {
      bestScore = score;
      bestTime = t;
    }
  }
  return bestTime;
}

const PLAY_PATH = [[4, 1], [8, 1], [10, 2], [14, 2], [17, 1], [19, 1], [20, 4], [19, 6]];
const END_PATH = [
  [4, 1], [8, 1], [10, 2], [14, 2], [17, 1], [19, 1],
  [21, 3], [21, 6], [20, 8], [18, 8],
  [21, 8], [21, 11], [21, 13], [16, 13], [12, 13], [8, 13], [5, 12],
  [8, 13], [12, 13], [16, 13], [20, 13], [21, 12],
];

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Any unknown name is the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    runWaypoints(world, PLAY_PATH, 30);
    // The autopilot is deterministic, so re-running it to the best-scoring moment
    // reproduces the same run, framed where the cones read longest.
    const extra = bestConeMoment(world, 12);
    world.reset();
    runWaypoints(world, PLAY_PATH, 30);
    patrolOnly(world, extra);
    return { screen: SCREEN_PLAY, best: world.score };
  }
  if (name === 'alert') {
    // Bold: stand dead-centre in front of guard 0's northbound lane and wait
    // for him to walk up the lane into you (he pauses at the waypoint).
    runWaypoints(
      world,
      [[5, 2], [7, 2], [7, 3]],
      30,
      (w) => Math.max(0, ...w.state.guards.map((g) => g.suspicion)) >= 72,
      true,
      false,
    );
    return { screen: SCREEN_PLAY, best: world.score };
  }
  if (name === 'end') {
    const { events } = runWaypoints(world, END_PATH, 240);
    if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.score };
    if (events & EVENT_CLEAR) return { screen: SCREEN_CLEAR, best: world.score };
    return { screen: SCREEN_PLAY, best: world.score };
  }
  patrolOnly(world, 5);
  return { screen: SCREEN_TITLE, best: 0 };
}
