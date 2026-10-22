/* Shared harness: loads the real page script into jsdom and drives it with the
 * real Stockfish node build.
 *
 * HARD RULE: the node build of stockfish-19-lite-single.js keeps its engine
 * instance, command queue and listener at module scope, so every createEngine()
 * call in one process shares ONE engine. Two DOMs in one process therefore steal
 * each other's `bestmove` output and the app reports phantom invalid moves.
 * run-suite.cjs spawns one child process per scenario for exactly this reason.
 * Never send `quit` (it maps to process.exit in the node build).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const APP_PATH = path.join(ROOT, 'index.html');
const ENGINE_PATH = path.join(ROOT, 'stockfish-19-lite-single.js');
const createEngine = require(ENGINE_PATH);

const PREFS_KEY = 'engine-room-prefs-v2';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = [];
const say = (...a) => R.push('  ' + a.map(x => (x && typeof x === 'object') ? JSON.stringify(x) : String(x)).join(' '));
const check = (label, got, want) => R.push(`  ${got === want ? 'PASS' : 'FAIL'} ${label}: ${JSON.stringify(got)}${got === want ? '' : ' (want ' + JSON.stringify(want) + ')'}`);
const failureCount = () => R.filter(l => l.startsWith('  FAIL ')).length;

// Top-level const/let in a module script are not on the global object, so the
// app is given an explicit test window. Harness-only: never shipped.
const HOOKS = `
;window.__test={
 get game(){return game},get plyList(){return plyList},get fenHistory(){return fenHistory},
 get evalSeries(){return evalSeries},get reviewPly(){return reviewPly},get running(){return running},
 get busy(){return busy},get mode(){return mode},get humanSide(){return humanSide},get aIsWhite(){return aIsWhite},
 get seriesIndex(){return seriesIndex},get seriesResults(){return seriesResults},get clockState(){return clockState},
 get clockTickingSide(){return clockTickingSide},get flagSide(){return flagSide},get selectedSquare(){return selectedSquare},
 get pendingPromotion(){return pendingPromotion},get pausedForReview(){return pausedForReview},
 get currentMultiPV(){return currentMultiPV},get strengthCache(){return strengthCache},get flipped(){return flipped},
 get engineReady(){return engineReady},get engineFailed(){return engineFailed},
 fenShown(){return positionToShow().fen()},openingName(){return openingName()},resultTag(){return resultTag()},
 buildPgn(){return buildPgn()},startNewGame(a){return startNewGame(a)},setMode(m){return setMode(m)},setSide(s){return setSide(s)},
 undoMoves(){return undoMoves()},enterReview(p){return enterReview(p)},exitReview(r){return exitReview(r)},
 handleSquareClick(sq){return handleSquareClick(sq)},updateMatchInfo(){return updateMatchInfo()},
 loadPosition(fen,side){if(side)humanSide=side;game.load(fen);plyList=[];fenHistory=[game.fen()];evalSeries=[];reviewPly=null;flagSide=null;running=!gameEnded();selectedSquare=null;renderBoard();updateMatchInfo();}
};`;

function buildDom(seedPrefs, opts = {}) {
  let html = fs.readFileSync(APP_PATH, 'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('module script not found');
  const appSrc = m[1].replace(/^export \{[^}]*\};\s*$/m, '') + HOOKS;
  html = html.replace(m[0], '');

  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdomError: ' + (e.message || e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.map(x => (x && x.message) || x).join(' ')));

  const dom = new JSDOM(html, {
    url: opts.url || 'http://localhost:8000/index.html',
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
  });
  const w = dom.window;
  w.addEventListener('error', e => errs.push('window.error: ' + (e.error?.message || e.message)));

  const copied = [];
  if (!opts.noClipboard) {
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async t => { copied.push(t); } }, configurable: true });
  } else if (w.navigator.clipboard) {
    delete w.navigator.clipboard;
  }

  const cmds = [];
  const workers = [];
  class DefaultWorker {
    constructor() {
      this.engine = createEngine();
      this.engine.listener = line => setTimeout(() => this.onmessage && this.onmessage({ data: String(line) }), 0);
    }
    postMessage(c) {
      cmds.push(String(c));
      setTimeout(() => { try { this.engine.processCommand(String(c)); } catch (e) { errs.push(`cmd "${c}": ${e.message}`); } }, 0);
    }
    terminate() {}
  }
  const Base = opts.Worker || DefaultWorker;
  w.Worker = class extends Base { constructor(...args) { super(...args); workers.push(this); } };

  if (seedPrefs) w.localStorage.setItem(PREFS_KEY, typeof seedPrefs === 'string' ? seedPrefs : JSON.stringify(seedPrefs));
  try { w.eval(appSrc); } catch (e) { errs.push('EVAL: ' + e.stack); }

  const $ = id => w.document.getElementById(id);
  const ctx = {
    w, dom, errs, copied, cmds, workers, $,
    text: id => ($(id) ? $(id).textContent.trim() : '<no #' + id + '>'),
    hidden: id => ($(id) ? $(id).hidden : null),
    click: el => { if (!el) throw new Error('click: element is null'); return el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); },
    change: (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); },
    key: k => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true })),
    sq: s => w.document.querySelector(`.square[data-sq="${s}"]`),
    all: sel => [...w.document.querySelectorAll(sel)],
    // jsdom reports every rect as zero, which makes graph clicks no-op.
    stubRect: (el, rect) => { el.getBoundingClientRect = () => Object.assign({ left: 0, top: 0, width: 200, height: 52, right: 200, bottom: 52 }, rect); },
    t: w.__test,
  };
  ctx.ready = async (ms = 25000) => {
    for (let i = 0; i < ms / 20 && ctx.text('engine-status') !== 'Stockfish ready'; i++) await sleep(20);
    return ctx.text('engine-status') === 'Stockfish ready';
  };
  ctx.play = async (n, timeoutMs = 90000) => {
    const t0 = Date.now(); let last = -1, stalls = 0;
    for (;;) {
      await sleep(20);
      const c = ctx.t.plyList.length;
      if (c >= n) return true;
      if (c === last) { if (++stalls > timeoutMs / 20) return false; } else { stalls = 0; last = c; }
      if (Date.now() - t0 > timeoutMs) return false;
    }
  };
  // Only real option values: an unknown value leaves the select empty and the
  // app falls back to a default, which silently tests the wrong thing.
  ctx.watch = (o = {}) => {
    const { depth = '6', variety = 'normal', speed = '0', limit = 'depth', movetime = '500', clock = '60000+0', series = null } = o;
    if (limit !== 'depth') ctx.change($('limit-select'), limit);
    if (limit === 'depth') $('depth-range').value = depth;
    if (limit === 'movetime') ctx.change($('movetime-select'), movetime);
    if (limit === 'clock') ctx.change($('clock-select'), clock);
    $('speed-select').value = speed;
    $('variety-select').value = variety;
    if (series) ctx.change($('series-select'), series);
  };
  return ctx;
}

const sans = c => c.t.plyList.map(p => p.san).join(' ');
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

module.exports = { buildDom, say, check, failureCount, sans, sleep, R, START_FEN, PREFS_KEY, APP_PATH, ROOT };
