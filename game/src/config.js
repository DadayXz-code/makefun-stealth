// GHOSTLINE: Night Infiltration — every tuning number and level in one place.
// A top-down 2D stealth game on a 20x15 tile grid (40 px tiles, 800x600 field).
// Map legend: '#' wall, 'C' crate (both solid and sight-blocking), '.' floor,
// 'B' bush (walkable, hides the player), 'P' player start, 'E' exit,
// 'I' intel file, 'G' guard spawn (one per patrol, in scan order).

export const TILE = 40;
export const COLS = 20;
export const ROWS = 15;
export const FIELD_WIDTH = COLS * TILE;
export const FIELD_HEIGHT = ROWS * TILE;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const LIVES = 3;
export const PLAYER_RADIUS = 13;
export const GUARD_RADIUS = 13;

export const WALK_SPEED = 110;
export const RUN_SPEED = 175;
export const SNEAK_SPEED = 55;
export const GUARD_PATROL_SPEED = 55;
export const GUARD_SUSPECT_SPEED = 78;
export const GUARD_CHASE_SPEED = 145;

/** Guard sight: how far a guard can see, and half the vision cone's angle. */
export const VIEW_RANGE = 300;
export const CONE_HALF = 0.65;
/** Suspicion gained per second, dead-centre in the cone at point-blank range. */
export const DETECT_BASE = 55;
/** Suspicion gained while standing in a bush, as a fraction of the open rate. */
export const BUSH_FACTOR = 0.35;
export const SNEAK_FACTOR = 0.5;
export const RUN_FACTOR = 1.4;
/** Suspicion at which a guard goes from patrolling to suspicious, and to alert. */
export const SUSPECT_AT = 40;
export const ALERT_AT = 100;

export const PEBBLES_PER_LEVEL = 3;
export const PEBBLE_SPEED = 300;
export const PEBBLE_RANGE = 150;
export const PEBBLE_HEARING = 260;
export const NOISE_RADIUS = 200;
export const NOISE_INTERVAL = 0.35;

export const CATCH_DISTANCE = 26;
export const INTEL_PICKUP = 22;
export const EXIT_REACH = 24;
export const LASER_TRIP = 16;
export const LASER_ALARM = 40;
export const ALERT_ALARM = 25;
export const CAUGHT_ALARM = 30;
export const ALARM_DECAY = 2.5;

export const INTEL_POINTS = 250;
export const LEVEL_CLEAR_POINTS = 1000;
export const GHOST_BONUS = 500;
export const LIFE_BONUS = 500;
export const TIME_BONUS_MAX = 900;
export const TIME_BONUS_PER_SECOND = 10;

export const PALETTE = {
  backdrop: '#0a0d12',
  floor: '#171c26',
  floorAlt: '#1a202c',
  wall: '#39415a',
  wallTop: '#4a5470',
  crate: '#6b5433',
  crateEdge: '#8a6d42',
  bush: '#1e4d2b',
  bushLeaf: '#2c6b3c',
  player: '#e8e6df',
  playerDark: '#9aa3b2',
  guard: '#e5534b',
  guardSuspect: '#f2c94c',
  cone: 'rgba(242, 201, 76, 0.13)',
  coneAlert: 'rgba(229, 83, 75, 0.20)',
  intel: '#f2c94c',
  exitLocked: '#e5534b',
  exitOpen: '#58d68d',
  laser: '#ff3b30',
  laserDark: 'rgba(255, 59, 48, 0.18)',
  pebble: '#c9ced6',
  panel: '#12161f',
  panelEdge: '#2c3547',
  text: '#eef1f5',
  muted: '#8b93a3',
  gold: '#f2c94c',
  danger: '#e5534b',
  ok: '#58d68d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ghostline.best';

export const LEVELS = [
  {
    name: 'The Warehouse',
    intel: 3,
    map: [
      '####################',
      '#P....#.....I......#',
      '#.....#............#',
      '#.....##.....#.....#',
      '#..C..#...B........#',
      '#.....#............#',
      '#.G...#.....C..#...#',
      '#.....#............#',
      '#..B......G....G...#',
      '#.....#............#',
      '#..B..#.....#...I..#',
      '#.....#.....#...#..#',
      '#.....#.....#...#E.#',
      '#..I...............#',
      '####################',
    ],
    patrols: [
      [[2, 6], [2, 10], [5, 10], [5, 6]],
      [[10, 8], [16, 8], [16, 5], [10, 5]],
      [[15, 8], [18, 8], [18, 10], [15, 10]],
    ],
    lasers: [],
  },
  {
    name: 'The Server Farm',
    intel: 4,
    map: [
      '####################',
      '#P....#....I...#..I#',
      '#.....#........#...#',
      '#..C..#..B.....#...#',
      '#.....#........#..C#',
      '#..G..#...G....#..G#',
      '#.....#............#',
      '#.....#....#.......#',
      '#..B.......#...G...#',
      '#.....#....#.......#',
      '#.....#....#...I...#',
      '#.....#....#.......#',
      '#..I.......#.......#',
      '#..........#....E..#',
      '####################',
    ],
    patrols: [
      [[3, 5], [3, 9], [5, 9], [5, 5]],
      [[10, 5], [10, 2], [13, 2], [13, 5]],
      [[15, 8], [18, 8], [18, 12], [15, 12]],
      [[17, 5], [17, 3], [16, 3], [16, 5]],
    ],
    lasers: [],
  },
  {
    name: 'The Rooftop Lab',
    intel: 4,
    map: [
      '####################',
      '#P.....#....I......#',
      '#......#...........#',
      '#..C...#..B....#..I#',
      '#......#........#..#',
      '#..G...#...G....#..#',
      '#......#........#..#',
      '#......#....#......#',
      '#..B........#..G...#',
      '#......#....#......#',
      '#......#....#..I...#',
      '#......#....#......#',
      '#..I........#..G...#',
      '#...........#...E..#',
      '####################',
    ],
    patrols: [
      [[3, 5], [3, 9], [6, 9], [6, 5]],
      [[11, 5], [11, 2], [14, 2], [14, 5]],
      [[15, 8], [18, 8], [18, 11], [15, 11]],
      [[15, 12], [18, 12], [18, 13], [15, 13]],
    ],
    // [x1, y1, x2, y2, period, phase] in tile-corner coordinates: the beam runs
    // along the grid lines, so crossing between two rows (or columns) trips it.
    lasers: [
      [1, 7, 7, 7, 4, 0],
      [12, 3, 12, 9, 6, 2],
      [3, 11, 10, 11, 5, 1],
    ],
  },
];
