// The screenshot scenes behind ?shot=start|play|alert|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// a simple autopilot, so the frame is what a short game really looks like and
// the same seed always gives the same frame.
//
// The autopilot plans a route across the tile grid (Dijkstra, with a steep
// cost for tiles a guard can see), so it walks around walls and around vision
// cones the way a careful player would, and it runs from a guard that is
// alert. The 'end' pilot plans the same way but ignores the cones, so it is
// caught, as a hurried player is.

import { COLS, CONE_HALF, ROWS, STEP, TILE, VIEW_RANGE } from './config.js';
import { EVENT_CAUGHT, EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 15;
const ALERT_SECONDS = 30;
const END_LIMIT_SECONDS = 600;

/** Probe a step ahead: is the point (x, y) on walkable ground? */
function probe(world, x, y) {
  return world.isWalkable(x, y);
}

/** Steer toward (tx, ty), trying the direct way first, then wider turns. */
function steerToward(world, tx, ty) {
  const player = world.state.player;
  const want = Math.atan2(ty - player.y, tx - player.x);
  const candidates = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI];
  for (const turn of candidates) {
    const angle = want + turn;
    const ahead = 22;
    if (probe(world, player.x + Math.cos(angle) * ahead, player.y + Math.sin(angle) * ahead)) {
      return { x: Math.cos(angle), y: Math.sin(angle), run: false, sneak: false };
    }
  }
  return { x: 0, y: 0, run: false, sneak: false };
}

/** The nearest intel file not yet lifted, else the exit. */
function nextTarget(world) {
  const state = world.state;
  let best = null;
  let bestDist = Infinity;
  for (const item of state.intel) {
    if (item.taken) continue;
    const d = Math.hypot(item.x - state.player.x, item.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best ?? state.exit;
}

/** The cautious pilot: toward the target, running away from any guard that is alert. */
function carefulPilot(world) {
  const alert = world.state.guards.find((g) => g.state === 'alert');
  if (alert) return fleeFrom(world, alert);
  const target = nextTarget(world);
  return followRoute(world, target.x, target.y, true);
}

/** Whether the point (x, y) sits inside any guard's vision cone right now. */
function exposedAt(world, x, y) {
  for (const guard of world.state.guards) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > VIEW_RANGE) continue;
    let diff = Math.atan2(dy, dx) - guard.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > CONE_HALF) continue;
    if (!world.hasLineOfSight(guard.x, guard.y, x, y)) continue;
    return true;
  }
  return false;
}

/** Follow a Dijkstra route to (tx, ty): around the walls, and around the
 * guards' cones too when `avoid` is set. Replanned every step, so the route
 * follows the cones as the guards walk. */
function followRoute(world, tx, ty, avoid) {
  const { dist, prev, start } = dijkstra(world, avoid ? coneCost : () => 0);
  const gx = Math.floor(tx / TILE);
  const gy = Math.floor(ty / TILE);
  const gk = gy * COLS + gx;
  if (!dist.has(gk)) return steerToward(world, tx, ty);
  const path = pathFrom(prev, start, [gx, gy]);
  if (path.length === 0) return steerToward(world, tx, ty);
  const [nx, ny] = path[0];
  return steerToward(world, (nx + 0.5) * TILE, (ny + 0.5) * TILE);
}

/** Extra cost of stepping on a tile: steep when a guard can see it. */
function coneCost(world, tx, ty) {
  return exposedAt(world, (tx + 0.5) * TILE, (ty + 0.5) * TILE) ? 12 : 0;
}

/** Dijkstra over the tile grid from the player's tile. `costFn(world, tx, ty)`
 * adds the extra cost of a tile on top of 1 per step. Returns the distance
 * and predecessor maps (keys are ty * COLS + tx) and the start tile. */
function dijkstra(world, costFn) {
  const def = world.levelDef;
  const px = Math.floor(world.state.player.x / TILE);
  const py = Math.floor(world.state.player.y / TILE);
  const key = (x, y) => y * COLS + x;
  const solid = (x, y) => {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
    const ch = def.map[y][x];
    return ch === '#' || ch === 'C';
  };
  const dist = new Map([[key(px, py), 0]]);
  const prev = new Map();
  const open = [[0, px, py]];
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i][0] < open[bi][0]) bi = i;
    const [d, x, y] = open.splice(bi, 1)[0];
    if (d !== dist.get(key(x, y))) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (solid(nx, ny)) continue;
      const nd = d + 1 + costFn(world, nx, ny);
      if (nd < (dist.get(key(nx, ny)) ?? Infinity)) {
        dist.set(key(nx, ny), nd);
        prev.set(key(nx, ny), [x, y]);
        open.push([nd, nx, ny]);
      }
    }
  }
  return { dist, prev, start: [px, py] };
}

/** The tiles of the route from `start` to `goal`, first step first. */
function pathFrom(prev, start, goal) {
  const path = [];
  let cur = goal;
  let guard = 0;
  while (!(cur[0] === start[0] && cur[1] === start[1]) && guard < 400) {
    path.unshift(cur);
    cur = prev.get(cur[1] * COLS + cur[0]);
    if (!cur) return [];
    guard += 1;
  }
  return path;
}

/** Run away from a guard: route to the reachable tile farthest from him. */
function fleeFrom(world, guard) {
  const { dist, prev, start } = dijkstra(world, coneCost);
  let best = null;
  let bestScore = -Infinity;
  for (const [k, d] of dist) {
    if (d > 8) continue;
    const tx = k % COLS;
    const ty = Math.floor(k / COLS);
    const cx = (tx + 0.5) * TILE;
    const cy = (ty + 0.5) * TILE;
    const score = Math.hypot(cx - guard.x, cy - guard.y) - d * 4;
    if (score > bestScore) {
      bestScore = score;
      best = [tx, ty];
    }
  }
  if (best === null) return { x: 0, y: 0, run: false, sneak: false };
  const path = pathFrom(prev, start, best);
  if (path.length === 0) return { x: 0, y: 0, run: false, sneak: false };
  const [tx, ty] = path[0];
  const step = steerToward(world, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
  return { ...step, run: true };
}

/** The reckless pilot: around the walls toward the target, never mind the guards. */
function recklessPilot(world) {
  const target = nextTarget(world);
  return followRoute(world, target.x, target.y, false);
}

/**
 * The hunting pilot: walk to a point in front of the nearest guard, inside
 * his cone, and stay there — walking straight at a guard only ever reaches
 * his back, and a back never raises the alarm.
 */
function huntingPilot(world) {
  const state = world.state;
  if (state.guards.some((g) => g.state === 'alert')) {
    return { x: 0, y: 0, run: false, sneak: false };
  }
  let best = null;
  let bestDist = Infinity;
  for (const guard of state.guards) {
    const d = Math.hypot(guard.x - state.player.x, guard.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = guard;
    }
  }
  if (best === null) return { x: 0, y: 0, run: false, sneak: false };
  const tx = best.x + Math.cos(best.angle) * 110;
  const ty = best.y + Math.sin(best.angle) * 110;
  return steerToward(world, tx, ty);
}

/**
 * Set `world` to the named scene (start, play, alert or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'alert' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { x: 0, y: 0, run: false, sneak: false }, 0);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'alert') {
    for (let i = 0; i < ALERT_SECONDS / STEP; i += 1) {
      const events = world.step(STEP, huntingPilot(world), 0);
      if (events & EVENT_CAUGHT) break;
      if (world.state.guards.some((g) => g.state === 'alert')) {
        // Hold the frame a moment so the '!' and the red cone read clearly —
        // short enough that the chasing guard has not caught the player yet.
        for (let j = 0; j < 20; j += 1) world.step(STEP, { x: 0, y: 0, run: false, sneak: false }, 0);
        break;
      }
    }
    return { screen: SCREEN_PLAY, best: world.score };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const pilot = name === 'end' ? recklessPilot : carefulPilot;
  let screen = SCREEN_PLAY;
  for (let i = 0; i < limit / STEP; i += 1) {
    const events = world.step(STEP, pilot(world), 0);
    if (events & EVENT_WIN) {
      screen = SCREEN_WIN;
      break;
    }
    if (events & EVENT_OVER) {
      screen = SCREEN_OVER;
      break;
    }
    // A level clear just loads the next level: keep playing, so the frame
    // always shows live play rather than a panel.
  }
  return { screen, best: world.score };
}

// Re-exported so main.js can share the screen names without importing render.
export { SCREEN_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN };
