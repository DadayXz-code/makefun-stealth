// Drawing only: the world's state and the current screen in, pixels out. The
// 800x600 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Vision cones are raycast, so a wall or crate cuts
// the cone exactly where it cuts the guard's sight. Flat shapes and canvas
// text for the HUD and the panels.

import {
  COLS,
  CONE_HALF,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  FONT,
  LIVES,
  PALETTE,
  ROWS,
  TILE,
  VIEW_RANGE,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const CONE_RAYS = 26;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD_WIDTH, height / FIELD_HEIGHT);
    view.x = (width - FIELD_WIDTH * view.scale) / 2;
    view.y = (height - FIELD_HEIGHT * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = baseline ?? 'alphabetic';
    context.fillText(value, x, y);
  }

  function isSolidTile(def, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    const ch = def.map[ty][tx];
    return ch === '#' || ch === 'C';
  }

  /** Cast one ray of the cone until it hits a wall, and return its length. */
  function rayLength(def, gx, gy, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let len = 0;
    while (len < VIEW_RANGE) {
      len += 8;
      const x = gx + dx * len;
      const y = gy + dy * len;
      if (isSolidTile(def, Math.floor(x / TILE), Math.floor(y / TILE))) return len;
    }
    return VIEW_RANGE;
  }

  function drawCone(def, guard) {
    const color = guard.state === 'alert' ? PALETTE.coneAlert : PALETTE.cone;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(guard.x, guard.y);
    for (let i = 0; i <= CONE_RAYS; i += 1) {
      const angle = guard.angle - CONE_HALF + (2 * CONE_HALF * i) / CONE_RAYS;
      const len = rayLength(def, guard.x, guard.y, angle);
      context.lineTo(guard.x + Math.cos(angle) * len, guard.y + Math.sin(angle) * len);
    }
    context.closePath();
    context.fill();
  }

  function drawField(world, def) {
    const state = world.state;
    // Floor, checkerboard by tile.
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const ch = def.map[y][x];
        if (ch === '#') {
          context.fillStyle = PALETTE.wall;
          context.fillRect(x * TILE, y * TILE, TILE, TILE);
          context.fillStyle = PALETTE.wallTop;
          context.fillRect(x * TILE, y * TILE, TILE, 4);
        } else if (ch === 'C') {
          context.fillStyle = PALETTE.floor;
          context.fillRect(x * TILE, y * TILE, TILE, TILE);
          context.fillStyle = PALETTE.crate;
          context.fillRect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8);
          context.strokeStyle = PALETTE.crateEdge;
          context.lineWidth = 2;
          context.strokeRect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8);
          context.beginPath();
          context.moveTo(x * TILE + 4, y * TILE + 4);
          context.lineTo(x * TILE + TILE - 4, y * TILE + TILE - 4);
          context.moveTo(x * TILE + TILE - 4, y * TILE + 4);
          context.lineTo(x * TILE + 4, y * TILE + TILE - 4);
          context.stroke();
        } else {
          context.fillStyle = (x + y) % 2 === 0 ? PALETTE.floor : PALETTE.floorAlt;
          context.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
        if (ch === 'B') {
          context.fillStyle = PALETTE.bush;
          context.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
          context.fillStyle = PALETTE.bushLeaf;
          for (const [ox, oy, r] of [[10, 12, 7], [26, 10, 8], [20, 26, 7], [32, 28, 6]]) {
            context.beginPath();
            context.arc(x * TILE + ox, y * TILE + oy, r, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
    }

    // Exit: a door on the wall edge of the map, locked red until every file is lifted.
    const exit = state.exit;
    context.fillStyle = state.exitOpen ? PALETTE.exitOpen : PALETTE.exitLocked;
    context.fillRect(exit.x - 14, exit.y - 14, 28, 28);
    context.fillStyle = PALETTE.panel;
    context.fillRect(exit.x - 9, exit.y - 9, 18, 18);
    if (state.exitOpen) {
      context.fillStyle = PALETTE.exitOpen;
      context.beginPath();
      context.moveTo(exit.x - 5, exit.y);
      context.lineTo(exit.x - 1, exit.y + 5);
      context.lineTo(exit.x + 6, exit.y - 5);
      context.lineWidth = 3;
      context.strokeStyle = PALETTE.exitOpen;
      context.stroke();
    } else {
      context.fillStyle = PALETTE.exitLocked;
      context.fillRect(exit.x - 3, exit.y - 6, 6, 8);
      context.beginPath();
      context.arc(exit.x, exit.y + 3, 4, 0, Math.PI * 2);
      context.fill();
    }

    // Intel files: gold diamonds.
    for (const item of state.intel) {
      if (item.taken) continue;
      const pulse = 1 + 0.12 * Math.sin(world.world.time * 4 + item.x);
      context.fillStyle = PALETTE.intel;
      context.beginPath();
      context.moveTo(item.x, item.y - 10 * pulse);
      context.lineTo(item.x + 8 * pulse, item.y);
      context.lineTo(item.x, item.y + 10 * pulse);
      context.lineTo(item.x - 8 * pulse, item.y);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.panel;
      context.fillRect(item.x - 2, item.y - 4, 4, 8);
    }

    // Lasers: bright when lit, a faint dashed line while dark.
    for (const laser of state.lasers) {
      if (laser.lit) {
        context.strokeStyle = PALETTE.laser;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(laser.x1, laser.y1);
        context.lineTo(laser.x2, laser.y2);
        context.stroke();
        context.fillStyle = PALETTE.laser;
        for (const [ex, ey] of [[laser.x1, laser.y1], [laser.x2, laser.y2]]) {
          context.beginPath();
          context.arc(ex, ey, 4, 0, Math.PI * 2);
          context.fill();
        }
      } else {
        context.strokeStyle = PALETTE.laserDark;
        context.lineWidth = 2;
        context.setLineDash([6, 6]);
        context.beginPath();
        context.moveTo(laser.x1, laser.y1);
        context.lineTo(laser.x2, laser.y2);
        context.stroke();
        context.setLineDash([]);
      }
    }

    // Sound rings from a landed pebble.
    for (const ring of state.rings) {
      const progress = 1 - ring.t / 0.6;
      context.strokeStyle = `rgba(201, 206, 214, ${0.7 * (1 - progress)})`;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(ring.x, ring.y, 6 + progress * 46, 0, Math.PI * 2);
      context.stroke();
    }

    // The pebble in flight.
    const pebble = world.world.pebble;
    if (pebble !== null) {
      context.fillStyle = PALETTE.pebble;
      context.beginPath();
      context.arc(pebble.x, pebble.y, 4, 0, Math.PI * 2);
      context.fill();
    }

    // Guards: cones first, then the guard, then the ? / ! and the suspicion bar.
    for (const guard of state.guards) drawCone(def, guard);
    for (const guard of state.guards) {
      context.fillStyle = guard.state === 'alert' ? PALETTE.danger : guard.state === 'suspect' ? PALETTE.guardSuspect : PALETTE.guard;
      context.beginPath();
      context.arc(guard.x, guard.y, 13, 0, Math.PI * 2);
      context.fill();
      // Visor: the direction the guard faces.
      context.strokeStyle = PALETTE.panel;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(guard.x, guard.y);
      context.lineTo(guard.x + Math.cos(guard.angle) * 13, guard.y + Math.sin(guard.angle) * 13);
      context.stroke();
      if (guard.suspicion > 1) {
        const w = 30;
        context.fillStyle = PALETTE.panel;
        context.fillRect(guard.x - w / 2, guard.y - 26, w, 5);
        context.fillStyle = guard.state === 'alert' ? PALETTE.danger : PALETTE.guardSuspect;
        context.fillRect(guard.x - w / 2, guard.y - 26, (w * guard.suspicion) / 100, 5);
      }
      if (guard.state === 'alert') {
        text('!', guard.x, guard.y - 30, 22, PALETTE.danger, 'center');
      } else if (guard.state === 'suspect') {
        text('?', guard.x, guard.y - 30, 22, PALETTE.guardSuspect, 'center');
      }
    }

    // The player: a hooded infiltrator, pale against the dark floor.
    const player = state.player;
    const inBush = def.map[Math.floor(player.y / TILE)]?.[Math.floor(player.x / TILE)] === 'B';
    if (player.invulnerable === 0 || Math.floor(player.invulnerable * 10) % 2 === 1) {
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(player.x, player.y, 13, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.playerDark;
      context.beginPath();
      context.arc(player.x + Math.cos(player.angle) * 5, player.y + Math.sin(player.angle) * 5, 7, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.panel;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(player.x + Math.cos(player.angle) * 13, player.y + Math.sin(player.angle) * 13);
      context.stroke();
    }
    if (inBush) {
      context.fillStyle = 'rgba(44, 107, 60, 0.75)';
      for (const [ox, oy, r] of [[-8, -6, 6], [8, -8, 6], [0, 8, 7]]) {
        context.beginPath();
        context.arc(player.x + ox, player.y + oy, r, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawHud(world) {
    const state = world.state;
    context.fillStyle = 'rgba(10, 13, 18, 0.82)';
    context.fillRect(0, 0, FIELD_WIDTH, 34);
    context.textBaseline = 'top';
    text(`Score ${world.score}`, 12, 8, 18, PALETTE.text, 'left', 'top');
    text(`Level ${state.level} — ${world.levelName ?? ''}`, 210, 8, 18, PALETTE.text, 'left', 'top');
    const mm = String(Math.floor(state.elapsed / 60)).padStart(2, '0');
    const ss = String(Math.floor(state.elapsed % 60)).padStart(2, '0');
    text(`${mm}:${ss}`, 470, 8, 18, PALETTE.muted, 'left', 'top');
    text(`Intel ${state.collected}/${state.intel.length}`, 540, 8, 18, state.exitOpen ? PALETTE.ok : PALETTE.gold, 'left', 'top');
    text(`Pebbles ${state.pebbles}`, 650, 8, 18, PALETTE.text, 'left', 'top');
    // Lives as small hearts.
    for (let i = 0; i < LIVES; i += 1) {
      const x = 748 + i * 18;
      context.fillStyle = i < world.lives ? PALETTE.danger : PALETTE.panelEdge;
      context.beginPath();
      context.arc(x, 17, 6, 0, Math.PI * 2);
      context.fill();
    }
    // Alarm bar, bottom left.
    const barW = 150;
    context.fillStyle = PALETTE.panel;
    context.fillRect(12, FIELD_HEIGHT - 24, barW, 10);
    context.fillStyle = state.alarm > 66 ? PALETTE.danger : state.alarm > 33 ? PALETTE.guardSuspect : PALETTE.ok;
    context.fillRect(12, FIELD_HEIGHT - 24, (barW * state.alarm) / 100, 10);
    text('ALARM', 168, FIELD_HEIGHT - 26, 13, PALETTE.muted, 'left', 'top');
    if (state.ghost) text('GHOST', FIELD_WIDTH - 12, FIELD_HEIGHT - 26, 13, PALETTE.ok, 'right', 'top');
    else text('SPOTTED', FIELD_WIDTH - 12, FIELD_HEIGHT - 26, 13, PALETTE.danger, 'right', 'top');
  }

  function drawPanel(title, lines, prompt) {
    const width = 560;
    const height = 120 + lines.length * 30 + 56;
    const x = (FIELD_WIDTH - width) / 2;
    const y = (FIELD_HEIGHT - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD_WIDTH / 2, y + 58, 40, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD_WIDTH / 2, y + 108 + i * 30, 19, PALETTE.muted, 'center');
    }
    text(prompt, FIELD_WIDTH / 2, y + height - 26, 20, PALETTE.gold, 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(world, screen, best) {
    const state = world.state;
    const def = world.levelDef;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(world, def);
    if (screen === SCREEN_TITLE) {
      drawPanel('GHOSTLINE', [
        'Night Infiltration — slip in, lift every intel file, slip out.',
        'Move with WASD or arrows.  Shift runs (loud), C sneaks (quiet).',
        'Q throws a pebble to lure a guard.  P pauses, M mutes.',
        `Best score ${best}`,
      ], 'Press Space or click to start');
      return;
    }
    drawHud(world);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The guards will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_CLEAR) {
      drawPanel(`Level ${state.level - 1} clear`, [
        `Score ${world.score}`,
        state.ghost ? 'Ghost bonus kept — nobody raised the alarm.' : 'Spotted — the ghost bonus is gone.',
      ], 'Press Space for the next level');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Caught', [`Score ${world.score}`, `Best ${best}`], 'Press Space to try again');
    } else if (screen === SCREEN_WIN) {
      drawPanel('GHOSTLINE complete', [
        `Final score ${world.score}`,
        `${world.lives} ${world.lives === 1 ? 'life' : 'lives'} left — every one worth 500.`,
        `Best ${best}`,
      ], 'Press Space to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
