// Ghostline: tuning and levels.
// A level is an ASCII map, 24 columns by 15 rows, tile 40 px (960 x 600 playfield):
//   # wall (blocks movement and sight)   C crate (blocks movement and sight, low cover)
//   B bush / deep shadow (walkable, hides you)   . open floor
//   P player start   G guard spawn   I intel file   E exit   L laser emitter (level 3)
// Guard patrols are tile waypoints, walked in a loop. Lasers are segments with a
// blink cycle: cross one while it is lit and the alarm jumps.
export const TILE = 40;
export const COLS = 24;
export const ROWS = 15;
export const STEP = 1 / 60;
export const BEST_KEY = 'ghostline.best';

export const PLAYER = {
  radius: 12,
  walkSpeed: 132,
  sneakSpeed: 72,
  runSpeed: 196,
  noiseRadius: 104,
  pebbles: 3,
};

export const GUARD = {
  radius: 13,
  patrolSpeed: 58,
  suspectSpeed: 92,
  chaseSpeed: 148,
  viewDistance: 195,
  viewHalfAngle: 0.58,
  catchDistance: 26,
  suspectAt: 55,
  alertAt: 100,
  gainPerSecond: 85,
  decayPerSecond: 26,
};

export const LEVELS = [
  {
    name: '1 · The Archive',
    brief: 'Lift all 3 intel files, then slip out the east door unseen.',
    intel: 3,
    map: [
      '########################',
      '#P....B.....C......I...#',
      '#......................#',
      '#..####.....####...C...#',
      '#..#..........#........#',
      '#..#..G.......#...B....#',
      '#..####.....####.......#',
      '#..................C...#',
      '#..C......####....I....#',
      '#........#..#..........#',
      '#..B.....#..#.....##...#',
      '#........#..#...G.#....#',
      '#....I...####..C..#..E.#',
      '#......................#',
      '########################',
    ],
    patrols: [
      [[6, 5], [11, 5], [11, 7], [7, 7], [7, 5]],
      [[16, 11], [17, 11], [17, 13], [16, 13]],
    ],
    lasers: [],
  },
  {
    name: '2 · The Vault Floor',
    brief: 'Four files, three guards, tighter patrols. Bushes are your friends.',
    intel: 4,
    map: [
      '########################',
      '#P..C......B......I....#',
      '#..####...####...####..#',
      '#..#..............#....#',
      '#..#..G.....C....#.B...#',
      '#..####...####...####..#',
      '#......................#',
      '#.B....C......C....I...#',
      '#......................#',
      '#.I...#.G..#.#.G..#..C.#',
      '#......................#',
      '#.C...####...####..#...#',
      '#..............B...#.E.#',
      '#..I.......C.......#...#',
      '########################',
    ],
    patrols: [
      [[6, 4], [11, 4], [11, 3], [6, 3]],
      [[8, 9], [8, 8], [16, 8], [16, 10], [8, 10]],
      [[15, 9], [17, 9], [17, 10], [15, 10]],
    ],
    lasers: [],
  },
  {
    name: '3 · The Rooftop Lab',
    brief: 'Lasers blink on and off — cross them dark. Four guards. No mistakes.',
    intel: 4,
    map: [
      '########################',
      '#P....B....C.......I...#',
      '#..####.....####.......#',
      '#..#..........#...B....#',
      '#..#..G....C..#.G......#',
      '#..####.....####.......#',
      '#..................C...#',
      '#L....C....####....I...#',
      '#.........#....#.......#',
      '#..B......#.G..#...##..#',
      '#.........#....#...#...#',
      '#.I.G.C...####.....#.E.#',
      '#......................#',
      '#....I.....B....C......#',
      '########################',
    ],
    patrols: [
      [[6, 4], [10, 4], [10, 7], [7, 7], [7, 5]],
      [[15, 4], [18, 4], [18, 7], [17, 7], [17, 5], [16, 5]],
      [[12, 9], [14, 9], [14, 10], [12, 10]],
      [[4, 11], [5, 11], [5, 13], [8, 13], [8, 12], [4, 12]],
    ],
    // Lasers: [x1, y1, x2, y2, periodSeconds, phaseSeconds] in tile units.
    lasers: [
      [1, 7, 7, 7, 3.2, 0],
      [9, 7, 15, 7, 3.2, 1.6],
      [17, 7, 23, 7, 3.2, 0.8],
    ],
  },
];
