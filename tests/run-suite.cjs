/* Runs each scenario in its own process.
 *
 * This is not cosmetic: the node build of stockfish-19-lite-single.js keeps one
 * engine instance, one command queue and one listener per *process*, so two DOMs
 * in a single process steal each other's `bestmove` output and the app reports
 * phantom invalid moves. Real browser Workers are isolated, so users never hit
 * this — but the harness must fork to stay honest.
 *
 *   npm test                          # every scenario (~3 min)
 *   npm test -- boot watch pgn        # a subset
 *   node tests/run-suite.cjs clock    # same thing directly
 *
 * Exits non-zero if any check fails, so it is usable in CI.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const REPORTS = path.join(DIR, '.reports');

const ALL = ['boot', 'watch', 'review', 'strength', 'handicap', 'movetime', 'clock', 'series',
  'seriesEnd', 'playWhite', 'playBlack', 'playInteractions', 'promotion', 'pgn', 'pgnNoMoves',
  'pgnDownload', 'pgnBothFail', 'enginefail', 'prefs', 'prefsBogus', 'prefsCorrupt', 'gameover',
  'fullgame'];

const names = process.argv.slice(2).filter(a => !a.startsWith('-'));
const run = names.length ? names : ALL;
const unknown = run.filter(n => !ALL.includes(n));
if (unknown.length) {
  process.stderr.write(`Unknown scenario(s): ${unknown.join(', ')}\nAvailable: ${ALL.join(' ')}\n`);
  process.exit(2);
}

fs.mkdirSync(REPORTS, { recursive: true });
const out = [];
let totalFails = 0, passed = 0;

for (const name of run) {
  const file = path.join(REPORTS, `out-${name}.txt`);
  try { fs.unlinkSync(file); } catch (e) { /* absent is fine */ }
  let code = 0;
  const t0 = Date.now();
  try {
    execFileSync(process.execPath, [path.join(DIR, 'scenario.cjs'), name], { cwd: DIR, timeout: 600000, stdio: 'ignore' });
  } catch (e) { code = e.status === undefined || e.status === null ? -1 : e.status; }
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { text = `  ${name}: NO OUTPUT (exit ${code})\n`; }
  out.push(text.replace(/\n$/, ''));
  const fails = (text.match(/^  FAIL /gm) || []).length;
  const passes = (text.match(/^  PASS /gm) || []).length;
  totalFails += fails; passed += passes;
  process.stderr.write(`${fails ? 'FAIL' : ' ok '} ${name} (${passes + fails} checks, ${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
}

const report = out.join('\n') +
  `\n===== TOTAL FAILURES: ${totalFails} (of ${passed + totalFails} checks, ${run.length} scenarios) =====\n`;
fs.writeFileSync(path.join(REPORTS, 'suite.txt'), report);
process.stdout.write(report);
process.exit(totalFails ? 1 : 0);
