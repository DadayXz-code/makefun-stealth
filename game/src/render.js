// Ghostline renderer: one canvas, night palette. Vision cones are clipped by walls
// with a ray fan, so a cone stops at a crate exactly where your eyes say it should.
import { COLS, GUARD, PLAYER, ROWS, TILE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
export const SCREEN_CLEAR = 'clear';

const W = COLS * TILE;
const H = ROWS * TILE;
const RAYS = 26;

function conePolygon(world, guard) {
  const s = world.state;
  const points = [{ x: guard.x, y: guard.y }];
  const half = GUARD.viewHalfAngle;
  for (let i = 0; i <= RAYS; i += 1) {
    const a = guard.angle - half + (2 * half * i) / RAYS;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let d = 0;
    while (d < GUARD.viewDistance) {
      d += 6;
      const x = guard.x + dx * d;
      const y = guard.y + dy * d;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) break;
      if (s.grid[ty][tx] === '#' || s.grid[ty][tx] === 'C') break;
    }
    points.push({ x: guard.x + dx * Math.min(d, GUARD.viewDistance), y: guard.y + dy * Math.min(d, GUARD.viewDistance) });
  }
  return points;
}

export function coneReach(world, guard) {
  const poly = conePolygon(world, guard);
  let total = 0;
  for (let i = 1; i < poly.length; i += 1) total += Math.hypot(poly[i].x - guard.x, poly[i].y - guard.y);
  return total;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;

  function drawFloor(s) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const ch = s.grid[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (ch === '#') {
          ctx.fillStyle = '#2b3a57';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#3d5178';
          ctx.fillRect(px, py, TILE, 5);
          ctx.fillStyle = '#1d2942';
          ctx.fillRect(px, py + TILE - 4, TILE, 4);
        } else {
          const shade = (x * 7 + y * 13) % 3;
          ctx.fillStyle = shade === 0 ? '#171f30' : shade === 1 ? '#182234' : '#151d2e';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = 'rgba(255,255,255,0.03)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE, TILE);
        }
        if (ch === 'C') {
          ctx.fillStyle = '#6b4f2a';
          ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
          ctx.strokeStyle = '#8a6a3c';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);
          ctx.beginPath();
          ctx.moveTo(px + 4, py + 4);
          ctx.lineTo(px + TILE - 4, py + TILE - 4);
          ctx.moveTo(px + TILE - 4, py + 4);
          ctx.lineTo(px + 4, py + TILE - 4);
          ctx.stroke();
          ctx.lineWidth = 1;
        } else if (ch === 'B') {
          ctx.fillStyle = '#173d24';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#1f5232';
          for (let i = 0; i < 5; i += 1) {
            const bx = px + 6 + ((x * 11 + y * 5 + i * 7) % 28);
            const by = py + 6 + ((x * 3 + y * 9 + i * 11) % 28);
            ctx.beginPath();
            ctx.arc(bx, by, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  function drawLasers(s) {
    for (const laser of s.lasers) {
      const lit = laser.lit !== false;
      ctx.strokeStyle = lit ? 'rgba(255,60,70,0.9)' : 'rgba(255,60,70,0.18)';
      ctx.lineWidth = lit ? 3 : 1.5;
      ctx.setLineDash(lit ? [] : [6, 6]);
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ff5566';
      ctx.beginPath();
      ctx.arc(laser.x1, laser.y1, 5, 0, Math.PI * 2);
      ctx.arc(laser.x2, laser.y2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawIntelAndExit(s) {
    for (const item of s.intel) {
      if (item.taken) continue;
      const pulse = 0.6 + 0.4 * Math.sin(s.time * 4 + item.x);
      ctx.fillStyle = `rgba(255,214,90,${0.25 * pulse})`;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd65a';
      ctx.fillRect(item.x - 8, item.y - 10, 16, 20);
      ctx.fillStyle = '#1a2233';
      ctx.fillRect(item.x - 5, item.y - 6, 10, 3);
      ctx.fillRect(item.x - 5, item.y - 1, 10, 3);
      ctx.fillRect(item.x - 5, item.y + 4, 7, 3);
    }
    const e = s.exit;
    ctx.fillStyle = s.exitOpen ? 'rgba(80,255,170,0.25)' : 'rgba(120,140,170,0.18)';
    ctx.fillRect(e.x - 18, e.y - 18, 36, 36);
    ctx.strokeStyle = s.exitOpen ? '#50ffaa' : '#7d90ad';
    ctx.lineWidth = 3;
    ctx.strokeRect(e.x - 18, e.y - 18, 36, 36);
    ctx.fillStyle = s.exitOpen ? '#50ffaa' : '#7d90ad';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.exitOpen ? 'EXIT' : 'LOCK', e.x, e.y + 30);
    ctx.lineWidth = 1;
  }

  function drawGuards(world) {
    const s = world.state;
    for (const guard of s.guards) {
      // Vision cone, clipped by walls.
      const poly = conePolygon(world, guard);
      const alert = guard.state === 'alert';
      const suspect = guard.state === 'suspect' || guard.state === 'search';
      ctx.fillStyle = alert
        ? 'rgba(255,70,70,0.38)'
        : suspect
          ? 'rgba(255,165,60,0.30)'
          : 'rgba(255,220,90,0.26)';
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = alert ? 'rgba(255,70,70,0.65)' : 'rgba(255,220,90,0.4)';
      ctx.stroke();

      // Body: a guard with a facing tick and a state mark.
      ctx.fillStyle = alert ? '#ff5252' : suspect ? '#ffab40' : '#ffb74d';
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, GUARD.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#201409';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(guard.x, guard.y);
      ctx.lineTo(guard.x + Math.cos(guard.angle) * (GUARD.radius + 7), guard.y + Math.sin(guard.angle) * (GUARD.radius + 7));
      ctx.strokeStyle = '#201409';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 1;
      if (guard.suspicion > 8) {
        const w = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(guard.x - w / 2, guard.y - GUARD.radius - 12, w, 5);
        ctx.fillStyle = alert ? '#ff5252' : '#ffca28';
        ctx.fillRect(guard.x - w / 2, guard.y - GUARD.radius - 12, (w * guard.suspicion) / 100, 5);
      }
      if (alert || suspect) {
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = alert ? '#ff5252' : '#ffab40';
        ctx.fillText(alert ? '!' : '?', guard.x, guard.y - GUARD.radius - 16);
      }
    }
  }

  function drawPlayer(world) {
    const p = world.state.player;
    if (p.inBush) {
      ctx.fillStyle = 'rgba(23,61,36,0.85)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER.radius + 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2de1c2';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#06231d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    // Hood point: where you face.
    ctx.fillStyle = '#06231d';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8, 4, 0, Math.PI * 2);
    ctx.fill();
    if (p.sneaking) {
      ctx.strokeStyle = 'rgba(45,225,194,0.7)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPebbleAndNoise(world) {
    if (world.pebble) {
      ctx.fillStyle = '#cfd8dc';
      ctx.beginPath();
      ctx.arc(world.pebble.x, world.pebble.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pulse of world.noisePulses) {
      const t = pulse.age / 0.6;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - t)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, 8 + pulse.radius * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  function drawHud(game, best) {
    const s = game.world.state;
    ctx.fillStyle = 'rgba(8,12,22,0.82)';
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#e8eefc';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.def.name, 12, 18);
    // Intel pips.
    let x = 210;
    for (let i = 0; i < s.intel.length; i += 1) {
      ctx.fillStyle = i < s.collected ? '#ffd65a' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, 12, 12, 12);
      ctx.strokeStyle = '#ffd65a';
      ctx.strokeRect(x, 12, 12, 12);
      x += 18;
    }
    // Alarm meter.
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(330, 12, 130, 10);
    ctx.fillStyle = s.alarm > 60 ? '#ff5252' : s.alarm > 25 ? '#ffab40' : '#69f0ae';
    ctx.fillRect(330, 12, (130 * s.alarm) / 100, 10);
    ctx.fillStyle = '#e8eefc';
    ctx.fillText('ALARM', 280, 18);
    // Lives, time, score.
    ctx.fillStyle = '#ff8a80';
    ctx.fillText('♥'.repeat(Math.max(0, game.lives)), 480, 18);
    ctx.fillStyle = '#e8eefc';
    const mins = Math.floor(s.time / 60);
    const secs = Math.floor(s.time % 60);
    ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}`, 560, 18);
    ctx.fillText(`SCORE ${game.score}`, 640, 18);
    ctx.fillText(`PEBBLES ${s.player.pebbles} [Q]`, 770, 18);
    ctx.textAlign = 'right';
    ctx.fillText(`BEST ${best}`, W - 12, 18);
    ctx.textAlign = 'left';
    // Hint line.
    ctx.fillStyle = 'rgba(232,238,252,0.75)';
    ctx.font = '13px system-ui, sans-serif';
    const hint = s.exitOpen
      ? 'All intel lifted — reach the green EXIT.'
      : s.player.inBush
        ? 'Hidden in the dark — guards barely see you here.'
        : 'WASD move · SHIFT run (loud) · C sneak · Q throw a pebble · P pause';
    ctx.fillText(hint, 12, H - 12);
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(5,8,16,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillText(title, W / 2, H / 2 - 90);
    ctx.fillStyle = '#e8eefc';
    ctx.font = '17px system-ui, sans-serif';
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, H / 2 - 40 + i * 28);
    });
    ctx.textAlign = 'left';
  }

  return {
    draw(game, screen, best) {
      const world = game.world;
      const s = world.state;
      ctx.clearRect(0, 0, W, H);
      drawFloor(s);
      drawLasers(s);
      drawIntelAndExit(s);
      drawGuards(world);
      drawPlayer(world);
      drawPebbleAndNoise(world);
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(game, best);
      if (screen === SCREEN_TITLE) {
        overlay('GHOSTLINE', [
          'A night infiltration in three levels. Lift the intel, reach the exit,',
          'and never let a guard finish his sentence.',
          '',
          'WASD / arrows — move      SHIFT — run (loud)      C — sneak',
          'Q — throw a pebble to pull a guard away      P — pause      M — mute',
          '',
          'Bushes hide you. Crates block sight. Lasers blink — cross them dark.',
          '',
          'Press SPACE or click to begin.',
        ], '#2de1c2');
      } else if (screen === SCREEN_PAUSED) {
        overlay('PAUSED', ['Press P or SPACE to keep moving.'], '#e8eefc');
      } else if (screen === SCREEN_CLEAR) {
        overlay('LEVEL CLEAR', [
          `Ghost bonus ${s.ghost ? 'kept — no guard ever raised the alarm.' : 'lost — someone saw you.'}`,
          'Press SPACE for the next level.',
        ], '#50ffaa');
      } else if (screen === SCREEN_OVER) {
        overlay('CAUGHT', [
          `The guards closed in. Score ${game.score}. Best ${best}.`,
          'Press SPACE to try the night again.',
        ], '#ff5252');
      } else if (screen === SCREEN_WIN) {
        overlay('GHOST', [
          'Every file lifted. Every guard still wondering what that noise was.',
          `Final score ${game.score}. Best ${best}.`,
          'Press SPACE to run it again.',
        ], '#ffd65a');
      }
    },
  };
}
