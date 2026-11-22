// Ghostline world: pure logic, no DOM, so it can be tested headlessly.
// Guards patrol waypoints, see through a vision cone clipped by walls and crates,
// grow suspicious when they glimpse you, chase when sure, and investigate noises.
// Bushes hide you, running is loud, sneaking is slow and quiet, and a thrown
// pebble pulls a guard off his route.
import { COLS, GUARD, LEVELS, PLAYER, ROWS, STEP, TILE } from './config.js';

export const EVENT_PICKUP = 1;
export const EVENT_SUSPECT = 2;
export const EVENT_ALARM = 4;
export const EVENT_CAUGHT = 8;
export const EVENT_CLEAR = 16;
export const EVENT_WIN = 32;
export const EVENT_OVER = 64;
export const EVENT_LASER = 128;
export const EVENT_PEBBLE = 256;

const SOLID = new Set(['#', 'C']);
const SIGHT_BLOCK = new Set(['#', 'C']);

function tileCenter(t) {
  return (t + 0.5) * TILE;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function parseLevel(def) {
  const grid = def.map.map((row) => row.split(''));
  const intel = [];
  let player = null;
  let exit = null;
  let guardIndex = 0;
  const guards = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const ch = grid[y][x];
      if (ch === 'P') {
        player = { x: tileCenter(x), y: tileCenter(y) };
        grid[y][x] = '.';
      } else if (ch === 'I') {
        intel.push({ x: tileCenter(x), y: tileCenter(y), taken: false });
        grid[y][x] = '.';
      } else if (ch === 'E') {
        exit = { x: tileCenter(x), y: tileCenter(y) };
        grid[y][x] = '.';
      } else if (ch === 'G') {
        const patrol = def.patrols[guardIndex] ?? [[x, y]];
        guardIndex += 1;
        guards.push({
          x: tileCenter(x),
          y: tileCenter(y),
          angle: 0,
          patrol: patrol.map(([tx, ty]) => ({ x: tileCenter(tx), y: tileCenter(ty) })),
          waypoint: 0,
          state: 'patrol',
          suspicion: 0,
          investigate: null,
          lookTimer: 0,
          lostTimer: 0,
          stepTimer: 0,
        });
        grid[y][x] = '.';
      } else if (ch === 'L') {
        grid[y][x] = '.';
      }
    }
  }
  return { grid, player, intel, exit, guards };
}

export function createWorld(random) {
  const world = {
    random,
    state: null,
    levelIndex: 0,
    lives: 3,
    score: 0,
    levelStartScore: 0,
    status: 'play',
    noisePulses: [],
    pebble: null,
    laserCooldown: 0,
  };

  function loadLevel(index) {
    const def = LEVELS[index];
    const parsed = parseLevel(def);
    world.levelIndex = index;
    world.levelStartScore = world.score;
    world.state = {
      def,
      grid: parsed.grid,
      player: {
        x: parsed.player.x,
        y: parsed.player.y,
        angle: 0,
        pebbles: PLAYER.pebbles,
        moving: false,
        running: false,
        sneaking: false,
        inBush: false,
      },
      guards: parsed.guards,
      intel: parsed.intel,
      exit: parsed.exit,
      collected: 0,
      alarm: 0,
      time: 0,
      ghost: true,
      exitOpen: false,
      noiseTimer: 0,
      lasers: def.lasers.map(([x1, y1, x2, y2, period, phase]) => ({
        x1: x1 * TILE,
        y1: y1 * TILE,
        x2: x2 * TILE,
        y2: y2 * TILE,
        period,
        phase,
      })),
    };
    world.noisePulses = [];
    world.pebble = null;
    world.laserCooldown = 0;
    world.status = 'play';
  }

  function tileAtPx(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
    return world.state.grid[ty][tx];
  }

  function isSolidPx(x, y) {
    return SOLID.has(tileAtPx(x, y));
  }

  function isSightBlockPx(x, y) {
    return SIGHT_BLOCK.has(tileAtPx(x, y));
  }

  // Walk the segment in 4 px steps: any sight-blocking tile ends the line of sight.
  function hasLineOfSight(x0, y0, x1, y1) {
    const d = dist(x0, y0, x1, y1);
    const steps = Math.max(1, Math.ceil(d / 4));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (isSightBlockPx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  function moveCircle(body, dx, dy, radius) {
    const nextX = body.x + dx;
    if (
      !isSolidPx(nextX - radius, body.y - radius) &&
      !isSolidPx(nextX + radius, body.y - radius) &&
      !isSolidPx(nextX - radius, body.y + radius) &&
      !isSolidPx(nextX + radius, body.y + radius)
    ) {
      body.x = nextX;
    }
    const nextY = body.y + dy;
    if (
      !isSolidPx(body.x - radius, nextY - radius) &&
      !isSolidPx(body.x + radius, nextY - radius) &&
      !isSolidPx(body.x - radius, nextY + radius) &&
      !isSolidPx(body.x + radius, nextY + radius)
    ) {
      body.y = nextY;
    }
  }

  function playerSees(guard) {
    const p = world.state.player;
    const d = dist(guard.x, guard.y, p.x, p.y);
    const range = p.inBush ? GUARD.viewDistance * 0.55 : GUARD.viewDistance;
    if (d > range) return 0;
    const toPlayer = Math.atan2(p.y - guard.y, p.x - guard.x);
    if (Math.abs(angleDiff(toPlayer, guard.angle)) > GUARD.viewHalfAngle) return 0;
    if (!hasLineOfSight(guard.x, guard.y, p.x, p.y)) return 0;
    // Closer and more central in the cone reads faster; bush and sneak slow it down.
    const closeness = 1 - d / range;
    const centrality = 1 - Math.abs(angleDiff(toPlayer, guard.angle)) / GUARD.viewHalfAngle;
    let rate = GUARD.gainPerSecond * (0.35 + 0.65 * closeness) * (0.5 + 0.5 * centrality);
    if (p.inBush) rate *= 0.3;
    if (p.sneaking) rate *= 0.5;
    if (p.running) rate *= 1.25;
    return rate;
  }

  function hearNoise(x, y, radius) {
    world.noisePulses.push({ x, y, radius, age: 0 });
    for (const guard of world.state.guards) {
      if (guard.state === 'alert') continue;
      if (dist(guard.x, guard.y, x, y) <= radius) {
        guard.state = 'suspect';
        guard.investigate = { x, y };
        guard.suspicion = Math.max(guard.suspicion, GUARD.suspectAt);
      }
    }
  }

  function resetPositions() {
    const parsed = parseLevel(world.state.def);
    world.state.player.x = parsed.player.x;
    world.state.player.y = parsed.player.y;
    world.state.player.angle = 0;
    world.state.guards = parsed.guards;
    world.state.alarm = Math.max(0, world.state.alarm - 30);
    world.noisePulses = [];
    world.pebble = null;
  }

  function stepGuard(guard, dt) {
    const p = world.state.player;
    const seen = playerSees(guard);
    let events = 0;
    if (seen > 0) {
      const before = guard.suspicion;
      guard.suspicion = Math.min(GUARD.alertAt, guard.suspicion + seen * dt);
      if (before < GUARD.suspectAt && guard.suspicion >= GUARD.suspectAt && guard.state === 'patrol') {
        guard.state = 'suspect';
        guard.investigate = { x: p.x, y: p.y };
        events |= EVENT_SUSPECT;
      }
      if (guard.suspicion >= GUARD.alertAt && guard.state !== 'alert') {
        guard.state = 'alert';
        guard.lostTimer = 0;
        world.state.ghost = false;
        world.state.alarm = Math.min(100, world.state.alarm + 25);
        events |= EVENT_ALARM;
      }
      if (guard.state === 'alert') guard.lostTimer = 0;
      else if (guard.state === 'suspect') guard.investigate = { x: p.x, y: p.y };
    } else {
      guard.suspicion = Math.max(0, guard.suspicion - GUARD.decayPerSecond * dt);
      if (guard.state === 'alert') {
        guard.lostTimer += dt;
        if (guard.lostTimer > 3) {
          guard.state = 'search';
          guard.investigate = { x: p.x, y: p.y };
          guard.lookTimer = 0;
        }
      } else if (guard.state === 'suspect' && guard.suspicion < GUARD.suspectAt * 0.4) {
        guard.state = 'patrol';
        guard.investigate = null;
      }
    }

    let target = null;
    let speed = GUARD.patrolSpeed;
    if (guard.state === 'patrol') {
      target = guard.patrol[guard.waypoint];
      if (dist(guard.x, guard.y, target.x, target.y) < 6) {
        guard.waypoint = (guard.waypoint + 1) % guard.patrol.length;
        target = guard.patrol[guard.waypoint];
      }
    } else if (guard.state === 'suspect' || guard.state === 'search') {
      target = guard.investigate;
      speed = GUARD.suspectSpeed;
      if (target && dist(guard.x, guard.y, target.x, target.y) < 8) {
        if (guard.lookTimer === 0) guard.scanBase = guard.angle;
        guard.lookTimer += dt;
        if (guard.lookTimer > 1.4) {
          guard.state = 'patrol';
          guard.investigate = null;
          guard.lookTimer = 0;
          // Resume from the nearest waypoint so the patrol reads as a loop.
          let best = 0;
          let bestD = Infinity;
          guard.patrol.forEach((wp, i) => {
            const d = dist(guard.x, guard.y, wp.x, wp.y);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          guard.waypoint = best;
        }
        target = null;
      }
    } else if (guard.state === 'alert') {
      target = { x: p.x, y: p.y };
      speed = GUARD.chaseSpeed;
    }

    if (target) {
      const want = Math.atan2(target.y - guard.y, target.x - guard.x);
      let turn = angleDiff(want, guard.angle);
      const maxTurn = 4.5 * dt;
      guard.angle += Math.max(-maxTurn, Math.min(maxTurn, turn));
      moveCircle(guard, Math.cos(guard.angle) * speed * dt, Math.sin(guard.angle) * speed * dt, GUARD.radius);
    } else if (guard.state === 'suspect' || guard.state === 'search') {
      // Scan back and forth around where he arrived looking, not a full spin:
      // a player standing right there stays in view while he checks.
      guard.angle = (guard.scanBase ?? guard.angle) + Math.sin(guard.lookTimer * 1.8) * 0.9;
    }

    // Footstep ticks for the audio layer: faster when chasing.
    guard.stepTimer -= dt;
    if (guard.stepTimer <= 0) {
      guard.stepTimer = guard.state === 'alert' ? 0.32 : 0.55;
      guard.stepped = true;
    } else {
      guard.stepped = false;
    }
    return events;
  }

  function pointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return dist(px, py, x1 + dx * t, y1 + dy * t);
  }

  function step(dt, input, actions) {
    if (world.status !== 'play') return 0;
    const s = world.state;
    const p = s.player;
    let events = 0;
    s.time += dt;
    world.laserCooldown = Math.max(0, world.laserCooldown - dt);

    // --- player movement ---
    const speed = input.run ? PLAYER.runSpeed : input.sneak ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
    p.running = input.run && (input.x !== 0 || input.y !== 0);
    p.sneaking = input.sneak;
    p.moving = input.x !== 0 || input.y !== 0;
    if (p.moving) p.angle = Math.atan2(input.y, input.x);
    moveCircle(p, input.x * speed * dt, input.y * speed * dt, PLAYER.radius);
    p.inBush = tileAtPx(p.x, p.y) === 'B';

    // Running is loud: a pulse every 0.35 s that nearby guards come to check.
    if (p.running) {
      s.noiseTimer -= dt;
      if (s.noiseTimer <= 0) {
        s.noiseTimer = 0.35;
        hearNoise(p.x, p.y, PLAYER.noiseRadius);
      }
    }

    // Pebble: throw toward where you face; on landing it rings and pulls guards.
    if ((actions & EVENT_PEBBLE) !== 0 && p.pebbles > 0 && !world.pebble) {
      p.pebbles -= 1;
      world.pebble = {
        x: p.x,
        y: p.y,
        vx: Math.cos(p.angle) * 320,
        vy: Math.sin(p.angle) * 320,
        age: 0,
      };
      events |= EVENT_PEBBLE;
    }
    if (world.pebble) {
      const pb = world.pebble;
      pb.age += dt;
      pb.x += pb.vx * dt;
      pb.y += pb.vy * dt;
      pb.vx *= 1 - 3 * dt;
      pb.vy *= 1 - 3 * dt;
      if (pb.age > 0.4 || isSolidPx(pb.x, pb.y)) {
        hearNoise(pb.x, pb.y, 140);
        world.pebble = null;
      }
    }

    // Lasers: crossing a lit beam trips the alarm.
    for (const laser of s.lasers) {
      const phase = ((s.time + laser.phase) % laser.period) / laser.period;
      laser.lit = phase < 0.55;
      if (laser.lit && world.laserCooldown <= 0) {
        if (pointToSegment(p.x, p.y, laser.x1, laser.y1, laser.x2, laser.y2) < PLAYER.radius + 4) {
          world.laserCooldown = 1.5;
          s.alarm = Math.min(100, s.alarm + 40);
          s.ghost = false;
          for (const guard of s.guards) {
            if (guard.state !== 'alert') {
              guard.state = 'suspect';
              guard.investigate = { x: p.x, y: p.y };
              guard.suspicion = Math.max(guard.suspicion, GUARD.suspectAt);
            }
          }
          events |= EVENT_LASER;
        }
      }
    }

    // --- guards ---
    for (const guard of s.guards) {
      events |= stepGuard(guard, dt);
      if (guard.state === 'alert' && dist(guard.x, guard.y, p.x, p.y) < GUARD.catchDistance) {
        world.lives -= 1;
        events |= EVENT_CAUGHT;
        if (world.lives <= 0) {
          world.status = 'over';
          return events | EVENT_OVER;
        }
        resetPositions();
        return events;
      }
    }

    // Alarm cools down when nobody is chasing you.
    if (!s.guards.some((g) => g.state === 'alert')) {
      s.alarm = Math.max(0, s.alarm - 2.5 * dt);
    }

    // --- intel + exit ---
    for (const item of s.intel) {
      if (!item.taken && dist(p.x, p.y, item.x, item.y) < 24) {
        item.taken = true;
        s.collected += 1;
        world.score += 250;
        events |= EVENT_PICKUP;
      }
    }
    if (s.collected >= s.intel.length) s.exitOpen = true;
    if (s.exitOpen && dist(p.x, p.y, s.exit.x, s.exit.y) < 26) {
      const timeBonus = Math.max(0, 900 - Math.floor(s.time) * 10);
      world.score += 1000 + timeBonus + (s.ghost ? 500 : 0);
      events |= EVENT_CLEAR;
      if (world.levelIndex + 1 >= LEVELS.length) {
        world.score += world.lives * 500;
        world.status = 'win';
        return events | EVENT_WIN;
      }
      loadLevel(world.levelIndex + 1);
      return events;
    }

    for (const pulse of world.noisePulses) pulse.age += dt;
    world.noisePulses = world.noisePulses.filter((pulse) => pulse.age < 0.6);
    return events;
  }

  loadLevel(0);

  return {
    world,
    loadLevel,
    reset() {
      world.lives = 3;
      world.score = 0;
      loadLevel(0);
    },
    step,
    hasLineOfSight,
    tileAtPx,
    get status() {
      return world.status;
    },
    get state() {
      return world.state;
    },
    get lives() {
      return world.lives;
    },
    get score() {
      return world.score;
    },
    get levelIndex() {
      return world.levelIndex;
    },
    get pebble() {
      return world.pebble;
    },
    get noisePulses() {
      return world.noisePulses;
    },
    // For headless tests: advance the world with a scripted input.
    stepFixed(input, actions = 0, seconds = 1) {
      let events = 0;
      for (let t = 0; t < seconds / STEP; t += 1) events |= step(STEP, input, actions);
      return events;
    },
  };
}
