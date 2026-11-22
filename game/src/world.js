// GHOSTLINE's rules and state, with no drawing and no browser in it: the tile
// maps, guard patrols and vision cones, suspicion and alarm, intel and exits,
// pebbles, lasers, noise, score and lives. step() advances one fixed step and
// returns what happened as bit flags, so the caller can react without the world
// knowing about screens or sound. The world is deterministic for a fixed seed.
//
// The public surface the tests and the game use:
//   createWorld(random) -> { state, world, score, lives, levelIndex,
//                            loadLevel, reset, step, hasLineOfSight, isWalkable }
//   step(dt, input, actions) with input { x, y, run, sneak } and actions a
//   bitmask (EVENT_PEBBLE throws a pebble). A zero-dt step only throws the
//   pebble and advances nothing else, so the game can throw on a keypress
//   without waiting for the next frame.
import {
  ALARM_DECAY,
  ALERT_ALARM,
  ALERT_AT,
  BUSH_FACTOR,
  CATCH_DISTANCE,
  CAUGHT_ALARM,
  COLS,
  CONE_HALF,
  DETECT_BASE,
  EXIT_REACH,
  GHOST_BONUS,
  GUARD_CHASE_SPEED,
  GUARD_PATROL_SPEED,
  GUARD_RADIUS,
  GUARD_SUSPECT_SPEED,
  INTEL_PICKUP,
  INTEL_POINTS,
  LASER_ALARM,
  LASER_TRIP,
  LEVELS,
  LEVEL_CLEAR_POINTS,
  LIFE_BONUS,
  LIVES,
  NOISE_INTERVAL,
  NOISE_RADIUS,
  PEBBLE_HEARING,
  PEBBLE_RANGE,
  PEBBLE_SPEED,
  PEBBLES_PER_LEVEL,
  PLAYER_RADIUS,
  ROWS,
  RUN_FACTOR,
  RUN_SPEED,
  SNEAK_FACTOR,
  SNEAK_SPEED,
  STEP,
  SUSPECT_AT,
  TILE,
  TIME_BONUS_MAX,
  TIME_BONUS_PER_SECOND,
  VIEW_RANGE,
  WALK_SPEED,
} from './config.js';

export const EVENT_INTEL = 1;
export const EVENT_SUSPECT = 2;
export const EVENT_ALARM = 4;
export const EVENT_CAUGHT = 8;
export const EVENT_CLEAR = 16;
export const EVENT_LASER = 32;
export const EVENT_OVER = 64;
export const EVENT_WIN = 128;
export const EVENT_PEBBLE = 256;

const SOLID = new Set(['#', 'C']);

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Shortest distance from a point to a line segment. */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function createWorld(random) {
  const internal = { pebble: null, time: 0 };
  const state = {
    player: { x: 0, y: 0, angle: 0, invulnerable: 0 },
    guards: [],
    intel: [],
    exit: { x: 0, y: 0 },
    exitOpen: false,
    collected: 0,
    alarm: 0,
    ghost: true,
    elapsed: 0,
    level: 1,
    pebbles: PEBBLES_PER_LEVEL,
    rings: [],
    spawn: { x: 0, y: 0 },
    lasers: [],
  };
  let def = LEVELS[0];
  let noiseTimer = 0;

  const api = {
    state,
    world: internal,
    score: 0,
    lives: LIVES,
    levelIndex: 0,
    loadLevel,
    reset,
    step,
    hasLineOfSight,
    isWalkable,
  };

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
    return def.map[ty][tx];
  }

  function isSolidTile(tx, ty) {
    return SOLID.has(tileAt(tx, ty));
  }

  /** Whether the point (px, py) is on a walkable tile (not wall or crate). */
  function isWalkable(px, py) {
    return !isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** Whether a circle of radius r centred at (x, y) overlaps a solid tile. */
  function circleHitsSolid(x, y, r) {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        if (isSolidTile(tx, ty)) return true;
      }
    }
    return false;
  }

  /** Move a circle by (dx, dy), one axis at a time, so it slides along walls. */
  function moveCircle(body, dx, dy, radius) {
    if (dx !== 0) {
      const nx = body.x + dx;
      if (!circleHitsSolid(nx, body.y, radius)) body.x = nx;
    }
    if (dy !== 0) {
      const ny = body.y + dy;
      if (!circleHitsSolid(body.x, ny, radius)) body.y = ny;
    }
  }

  /** Whether a straight segment between two points crosses a solid tile. */
  function hasLineOfSight(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(dist / 8));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (isSolidTile(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
    }
    return true;
  }

  function tileIsBush(px, py) {
    return tileAt(Math.floor(px / TILE), Math.floor(py / TILE)) === 'B';
  }

  function loadLevel(index) {
    api.levelIndex = index;
    def = LEVELS[index];
    api.levelDef = def;
    api.levelName = def.name;
    state.level = index + 1;
    state.guards = [];
    state.intel = [];
    state.rings = [];
    state.collected = 0;
    state.exitOpen = false;
    state.alarm = 0;
    state.ghost = true;
    state.elapsed = 0;
    state.pebbles = PEBBLES_PER_LEVEL;
    internal.pebble = null;
    internal.time = 0;
    noiseTimer = 0;

    const spawns = [];
    def.map.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const cx = (x + 0.5) * TILE;
        const cy = (y + 0.5) * TILE;
        if (ch === 'P') {
          state.spawn = { x: cx, y: cy };
          state.player.x = cx;
          state.player.y = cy;
          state.player.angle = 0;
          state.player.invulnerable = 0;
        } else if (ch === 'E') {
          state.exit = { x: cx, y: cy };
        } else if (ch === 'I') {
          state.intel.push({ x: cx, y: cy, taken: false });
        } else if (ch === 'G') {
          spawns.push({ x: cx, y: cy });
        }
      });
    });
    def.patrols.forEach((patrol, i) => {
      const start = spawns[i] ?? { x: (patrol[0][0] + 0.5) * TILE, y: (patrol[0][1] + 0.5) * TILE };
      const points = patrol.map(([tx, ty]) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }));
      const next = points.length > 1 ? points[1] : points[0];
      state.guards.push({
        x: start.x,
        y: start.y,
        angle: Math.atan2(next.y - start.y, next.x - start.x),
        patrol: points,
        waypoint: points.length > 1 ? 1 : 0,
        state: 'patrol',
        suspicion: 0,
        investigate: null,
        lastSeen: null,
        wait: 0,
        look: 0,
      });
    });
    state.lasers = def.lasers.map(([x1, y1, x2, y2, period, phase]) => ({
      x1: x1 * TILE,
      y1: y1 * TILE,
      x2: x2 * TILE,
      y2: y2 * TILE,
      period,
      phase,
      cooldown: 0,
    }));
  }

  function reset() {
    api.score = 0;
    api.lives = LIVES;
    loadLevel(0);
  }

  function throwPebble() {
    if (internal.pebble !== null || state.pebbles <= 0) return false;
    state.pebbles -= 1;
    internal.pebble = {
      x: state.player.x,
      y: state.player.y,
      angle: state.player.angle,
      dist: 0,
    };
    return true;
  }

  function ringAt(x, y) {
    state.rings.push({ x, y, t: 0.6 });
    for (const guard of state.guards) {
      if (guard.state === 'alert') continue;
      if (Math.hypot(guard.x - x, guard.y - y) > PEBBLE_HEARING) continue;
      guard.state = 'suspect';
      guard.investigate = { x, y };
      guard.suspicion = Math.max(guard.suspicion, 45);
      guard.wait = 0;
      guard.look = 0;
    }
  }

  function noiseAt(x, y) {
    for (const guard of state.guards) {
      if (guard.state === 'alert') continue;
      if (Math.hypot(guard.x - x, guard.y - y) > NOISE_RADIUS) continue;
      if (guard.state === 'patrol') guard.state = 'suspect';
      guard.investigate = { x, y };
      guard.suspicion = Math.max(guard.suspicion, SUSPECT_AT);
      guard.wait = 0;
      guard.look = 0;
    }
  }

  /** Per-second suspicion gain for a guard that can see the player right now. */
  function detectionRate(guard) {
    const player = state.player;
    const dx = player.x - guard.x;
    const dy = player.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > VIEW_RANGE) return 0;
    if (!hasLineOfSight(guard.x, guard.y, player.x, player.y)) return 0;
    const diff = Math.abs(clampAngle(Math.atan2(dy, dx) - guard.angle));
    if (diff > CONE_HALF) return 0;
    let rate = DETECT_BASE * (1 - dist / VIEW_RANGE) * (1 - diff / CONE_HALF);
    if (tileIsBush(player.x, player.y)) rate *= BUSH_FACTOR;
    return rate;
  }

  function respawnAfterCatch() {
    state.player.x = state.spawn.x;
    state.player.y = state.spawn.y;
    state.player.angle = 0;
    state.player.invulnerable = 2;
    internal.pebble = null;
    for (const guard of state.guards) {
      const start = guard.patrol[0];
      guard.x = start.x;
      guard.y = start.y;
      const next = guard.patrol.length > 1 ? guard.patrol[1] : guard.patrol[0];
      guard.angle = Math.atan2(next.y - start.y, next.x - start.x);
      guard.waypoint = guard.patrol.length > 1 ? 1 : 0;
      guard.state = 'patrol';
      guard.suspicion = 0;
      guard.investigate = null;
      guard.lastSeen = null;
      guard.wait = 0;
      guard.look = 0;
    }
  }

  function stepGuard(guard, dt, input, events) {
    const player = state.player;
    const seen = detectionRate(guard) > 0;
    if (seen) {
      let rate = detectionRate(guard);
      if (input.sneak) rate *= SNEAK_FACTOR;
      if (input.run) rate *= RUN_FACTOR;
      guard.suspicion = Math.min(ALERT_AT, guard.suspicion + rate * dt);
      guard.lastSeen = { x: player.x, y: player.y };
      if (guard.suspicion >= ALERT_AT && guard.state !== 'alert') {
        guard.state = 'alert';
        guard.investigate = null;
        state.alarm = Math.min(100, state.alarm + ALERT_ALARM);
        state.ghost = false;
        events |= EVENT_ALARM;
      } else if (guard.suspicion >= SUSPECT_AT && guard.state === 'patrol') {
        guard.state = 'suspect';
        guard.investigate = { x: player.x, y: player.y };
        events |= EVENT_SUSPECT;
      }
    } else if (guard.state === 'patrol') {
      guard.suspicion = Math.max(0, guard.suspicion - 30 * dt);
    } else if (guard.state === 'alert') {
      guard.suspicion = Math.max(0, guard.suspicion - 15 * dt);
      if (guard.suspicion < SUSPECT_AT + 10 && guard.lastSeen !== null) {
        guard.state = 'suspect';
        guard.investigate = { x: guard.lastSeen.x, y: guard.lastSeen.y };
      }
    }
    // In 'suspect' with somewhere to check, suspicion holds until the guard
    // has looked around there; it only decays once he has nothing to check.

    if (guard.wait > 0) {
      guard.wait -= dt;
      return events;
    }

    if (guard.state === 'patrol') {
      const target = guard.patrol[guard.waypoint];
      const dx = target.x - guard.x;
      const dy = target.y - guard.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) {
        guard.waypoint = (guard.waypoint + 1) % guard.patrol.length;
        guard.wait = 0.5 + random() * 0.5;
        return events;
      }
      const stepLen = GUARD_PATROL_SPEED * dt;
      guard.angle = Math.atan2(dy, dx);
      moveCircle(guard, (dx / dist) * stepLen, (dy / dist) * stepLen, GUARD_RADIUS);
      return events;
    }

    if (guard.state === 'suspect') {
      if (guard.look > 0) {
        guard.look -= dt;
        guard.angle += 0.9 * dt;
        if (guard.look <= 0) guard.investigate = null;
        return events;
      }
      if (guard.investigate !== null) {
        const target = guard.investigate;
        const dx = target.x - guard.x;
        const dy = target.y - guard.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 8) {
          // Arrived: look around, keeping the investigate target until the
          // look is done so the guard stays suspicious while he searches.
          guard.look = 2;
          return events;
        }
        const stepLen = GUARD_SUSPECT_SPEED * dt;
        guard.angle = Math.atan2(dy, dx);
        moveCircle(guard, (dx / dist) * stepLen, (dy / dist) * stepLen, GUARD_RADIUS);
        return events;
      }
      guard.suspicion = Math.max(0, guard.suspicion - 20 * dt);
      if (guard.suspicion <= 0) guard.state = 'patrol';
      return events;
    }

    // alert: chase the player (or the last place they were seen).
    const target = seen ? { x: player.x, y: player.y } : guard.lastSeen ?? { x: player.x, y: player.y };
    const dx = target.x - guard.x;
    const dy = target.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const stepLen = GUARD_CHASE_SPEED * dt;
      guard.angle = Math.atan2(dy, dx);
      moveCircle(guard, (dx / dist) * stepLen, (dy / dist) * stepLen, GUARD_RADIUS);
    }
    if (player.invulnerable <= 0 && Math.hypot(player.x - guard.x, player.y - guard.y) < CATCH_DISTANCE) {
      api.lives -= 1;
      state.alarm = Math.min(100, state.alarm + CAUGHT_ALARM);
      events |= EVENT_CAUGHT;
      if (api.lives <= 0) {
        events |= EVENT_OVER;
      } else {
        respawnAfterCatch();
      }
    }
    return events;
  }

  /**
   * One fixed step. `input` is { x, y, run, sneak }; `actions` is a bitmask
   * (EVENT_PEBBLE throws a pebble). Returns the events of this step.
   */
  function step(dt, input, actions) {
    let events = 0;
    if (actions & EVENT_PEBBLE) {
      if (throwPebble()) events |= EVENT_PEBBLE;
    }
    if (dt <= 0) return events;

    internal.time += dt;
    state.elapsed += dt;
    const player = state.player;
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    // --- the thrown pebble flies, then lands and rings ---
    const pebble = internal.pebble;
    if (pebble !== null) {
      const fly = PEBBLE_SPEED * dt;
      const nx = pebble.x + Math.cos(pebble.angle) * fly;
      const ny = pebble.y + Math.sin(pebble.angle) * fly;
      pebble.dist += fly;
      if (pebble.dist >= PEBBLE_RANGE || !isWalkable(nx, ny)) {
        const at = { x: pebble.x, y: pebble.y };
        internal.pebble = null;
        ringAt(at.x, at.y);
      } else {
        pebble.x = nx;
        pebble.y = ny;
      }
    }

    // --- the player moves ---
    const speed = input.run ? RUN_SPEED : input.sneak ? SNEAK_SPEED : WALK_SPEED;
    let ix = input.x || 0;
    let iy = input.y || 0;
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    const moving = len > 0.05;
    if (moving) {
      player.angle = Math.atan2(iy, ix);
      moveCircle(player, ix * speed * dt, iy * speed * dt, PLAYER_RADIUS);
      if (input.run) {
        noiseTimer += dt;
        if (noiseTimer >= NOISE_INTERVAL) {
          noiseTimer = 0;
          noiseAt(player.x, player.y);
        }
      }
    }

    // --- the guards see, suspect, chase and catch ---
    for (const guard of state.guards) {
      events = stepGuard(guard, dt, input, events);
      if (events & EVENT_OVER) break;
    }

    // --- intel pickups ---
    if (!(events & EVENT_OVER)) {
      for (const item of state.intel) {
        if (item.taken) continue;
        if (Math.hypot(player.x - item.x, player.y - item.y) < INTEL_PICKUP) {
          item.taken = true;
          state.collected += 1;
          api.score += INTEL_POINTS;
          events |= EVENT_INTEL;
          if (state.collected >= state.intel.length) state.exitOpen = true;
        }
      }
    }

    // --- the exit (only once every file is lifted) ---
    if (!(events & EVENT_OVER) && state.exitOpen
      && Math.hypot(player.x - state.exit.x, player.y - state.exit.y) < EXIT_REACH) {
      const timeBonus = Math.max(0, TIME_BONUS_MAX - TIME_BONUS_PER_SECOND * Math.floor(state.elapsed));
      api.score += LEVEL_CLEAR_POINTS + timeBonus + (state.ghost ? GHOST_BONUS : 0);
      events |= EVENT_CLEAR;
      if (api.levelIndex >= LEVELS.length - 1) {
        api.score += api.lives * LIFE_BONUS;
        events |= EVENT_WIN;
      } else {
        loadLevel(api.levelIndex + 1);
      }
      return events;
    }

    // --- lasers: a lit beam trips the alarm ---
    for (const laser of state.lasers) {
      laser.cooldown = Math.max(0, laser.cooldown - dt);
      const lit = ((internal.time + laser.phase) % laser.period) < laser.period / 2;
      laser.lit = lit;
      if (lit && laser.cooldown <= 0
        && distToSegment(player.x, player.y, laser.x1, laser.y1, laser.x2, laser.y2) < LASER_TRIP) {
        state.alarm = Math.min(100, state.alarm + LASER_ALARM);
        state.ghost = false;
        events |= EVENT_LASER;
        laser.cooldown = 1;
      }
    }

    // --- the alarm cools while nobody is chasing ---
    if (!state.guards.some((g) => g.state === 'alert')) {
      state.alarm = Math.max(0, state.alarm - ALARM_DECAY * dt);
    }

    for (const ring of state.rings) ring.t -= dt;
    state.rings = state.rings.filter((ring) => ring.t > 0);

    return events;
  }

  loadLevel(0);
  return api;
}
