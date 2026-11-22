// GHOSTLINE — Night Infiltration: the entry's hand-in program (Node 22,
// standard library only). It runs in the grader's container with a read-only
// repository beside it and a writable /output, no network, and at most 10
// seconds.
//
// What it does, in order:
//   1. Copies game/ (the playable static game) into the output directory.
//   2. Decodes screenshots/ (base64 text, *.jpg.b64) back to the game's real
//      browser renders alongside it — the repository ships the screenshots as
//      text so a text-only push carries them, and the bytes decoded here are
//      the renders themselves, unchanged.
//   3. Writes dossier.json with buildDossier from vendor/makefun-game.ts,
//      the kit's library, unchanged — the dossier is what the judge reads:
//      the screenshots, and an outline of the game's source.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program is deterministic: run it twice and the output bytes are the
// same, because it only copies files and summarises them.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message: string): never {
  throw new Error(`GHOSTLINE hand-in failed: ${message}`);
}

function copyTree(source: string, target: string, label: string): void {
  if (!existsSync(source)) fail(`missing ${label} directory at ${source}`);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

function countFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? countFiles(path) : 1;
  }
  return total;
}

function checkShotSizes(dir: string): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const size = statSync(path).size;
    if (size > 262144) fail(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
}

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

mkdirSync(outputDir, { recursive: true });
copyTree(gameDir, join(outputDir, 'game'), 'game');

// Screenshots ship as base64 text (*.jpg.b64) so the repository stays
// text-only; decode each one back to its JPEG in the output directory.
if (!existsSync(shotsDir)) fail(`missing screenshots directory at ${shotsDir}`);
const shotsOutDir = join(outputDir, 'screenshots');
mkdirSync(shotsOutDir, { recursive: true });
for (const name of readdirSync(shotsDir)) {
  if (!name.endsWith('.jpg.b64')) continue;
  const jpgName = name.slice(0, -'.b64'.length);
  writeFileSync(join(shotsOutDir, jpgName), Buffer.from(readFileSync(join(shotsDir, name), 'utf8'), 'base64'));
}

const shotCount = readdirSync(shotsOutDir).filter((name) => !name.startsWith('.')).length;
if (shotCount < 3 || shotCount > 4) fail(`expected 3 or 4 screenshots, found ${shotCount}`);
checkShotSizes(shotsOutDir);
if (countFiles(gameDir) > 993) fail('game/ holds more than 993 files');

// The scorer's caps, as the kit's RULES.txt gives them: the dossier text is
// capped at 160 KiB, at most 4 screenshots of 256 KiB each, game/ at most
// 993 files and 48 MiB, every game path at most 1000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
