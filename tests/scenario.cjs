/* One scenario per invocation: node tests/scenario.cjs <name>
 * Writes tests/.reports/out-<name>.txt (stdout can be lost when piping on exit).
 */
const fs = require('fs');
const path = require('path');
const { buildDom, say, check, failureCount, sans, sleep, R, START_FEN } = require('./harness.cjs');

const REPORTS = path.join(__dirname, '.reports');

// Compare a fixed prefix: c.play(n) returns as soon as n plies exist, and at
// speed 0 the next move can land before the list is read.
const sansN = (c, n) => c.t.plyList.slice(0, n).map(p => p.san).join(' ');

const scenarios = {
  /* ------------------------------------------------------------------ boot */
  async boot() {
    const c = buildDom(); const ok = await c.ready();
    say('== BOOT ==');
    check('engine ready', ok, true);
    check('engine status', c.text('engine-status'), 'Stockfish ready');
    check('watch panel visible', c.hidden('watch-panel'), false);
    check('play panel hidden', c.hidden('play-panel'), true);
    check('scoreboard hidden for a single game', c.hidden('scoreboard'), true);
    check('series badge hidden for a single game', c.hidden('series-badge'), true);
    check('depth row visible', c.hidden('limit-depth-row'), false);
    check('movetime row hidden', c.hidden('limit-movetime-row'), true);
    check('clock row hidden', c.hidden('limit-clock-row'), true);
    check('clock chips hidden', c.hidden('clock-white'), true);
    check('elapsed clock visible', c.hidden('game-clock'), false);
    check('review bar hidden', c.hidden('review-bar'), true);
    check('promotion picker hidden', c.hidden('promotion-picker'), true);
    check('opening label', c.text('opening-name'), 'Opening · waiting for the first moves');
    check('white chip', c.text('white-chip'), 'Engine A');
    check('black chip', c.text('black-chip'), 'Engine B');
    check('64 squares', c.all('#board .square').length, 64);
    check('32 pieces', c.all('#board .piece-svg').length, 32);
    check('graph starts empty', c.$('eval-graph-wrap').classList.contains('empty'), true);
    check('undo disabled in watch mode', c.$('undo-button').disabled, true);
    check('run button enabled', c.$('run-button').disabled, false);
    check('nothing searched before start', c.cmds.filter(x => x.startsWith('go ')).length, 0);
    // flipping is purely visual: squares keep their real names either way
    const names = () => c.all('#board .square').map(el => el.dataset.sq);
    const before = names();
    check('unflipped starts at a8', before[0], 'a8');
    c.key('f');
    check('F flips the board', c.t.flipped, true);
    check('flipped starts at h1', names()[0], 'h1');
    check('all 64 squares survive the flip', names().length, 64);
    check('the same 64 squares are present', names().slice().sort().join(','), before.slice().sort().join(','));
    check('flipping reversed the order', names().join(','), before.slice().reverse().join(','));
    c.click(c.$('flip-button'));
    check('flip button flips back', c.t.flipped, false);
    check('back to a8', names()[0], 'a8');
    check('order restored exactly', names().join(','), before.join(','));
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ----------------------------------------------------------------- watch */
  async watch() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '8', variety: 'normal', speed: '0' });
    c.click(c.$('run-button'));
    say('== WATCH MODE ==');
    check('reached 12 plies', await c.play(12, 90000), true);
    say('moves:', sans(c));
    check('moves-stat matches', c.text('moves-stat'), String(c.t.plyList.length));
    check('history-count', c.text('history-count'), `${c.t.plyList.length} half-moves`);
    check('opening name shown', !!c.t.openingName(), true);
    say('opening:', c.text('opening-name'));
    check('move buttons rendered', c.all('.move-link').length, c.t.plyList.length);
    check('one latest marked', c.all('.move-link.latest').length, 1);
    check('fenHistory length', c.t.fenHistory.length, c.t.plyList.length + 1);
    check('eval points recorded', c.t.evalSeries.length >= 10, true);
    check('graph not empty', c.$('eval-graph-wrap').classList.contains('empty'), false);
    check('graph paths', c.all('#eval-graph path').length, 2);
    check('graph caret', c.all('#eval-graph .graph-caret').length, 1);
    say('eval text:', c.text('eval-text'), '| depth stat:', c.text('depth-stat'), '| nps:', c.text('nps-stat'));
    check('MultiPV on then off after opening',
      c.cmds.filter(x => x.includes('MultiPV')).join(','),
      'setoption name MultiPV value 4,setoption name MultiPV value 1');
    check('button says pause', c.$('run-button').textContent.includes('Pause match'), true);
    check('state is in progress or thinking', /progress|thinking/.test(c.text('game-state')), true);
    // pause / resume
    c.click(c.$('run-button')); await sleep(300);
    check('paused', c.t.running, false);
    check('button says start', c.$('run-button').textContent.includes('Start watching'), true);
    // variety: a new game must differ
    const first = sansN(c, 12);
    check('new game resets plies', (c.click(c.$('new-button')), c.t.plyList.length), 0);
    check('new game while paused stays paused', c.t.running, false);
    c.click(c.$('run-button'));
    check('second game played 12 plies', await c.play(12), true);
    say('second game:', sansN(c, 12));
    check('games differ (variety on)', sansN(c, 12) !== first, true);
    // fixed line stays deterministic, even reusing the same engine instance
    c.watch({ depth: '6', variety: 'off' });
    c.click(c.$('run-button')); await sleep(300);
    c.click(c.$('new-button')); await sleep(150);
    check('ucinewgame sent on reset', c.cmds.includes('ucinewgame'), true);
    c.click(c.$('run-button'));
    check('fixed game A played', await c.play(10, 60000), true);
    const fixedA = sansN(c, 10);
    c.click(c.$('run-button')); await sleep(300);
    c.click(c.$('new-button')); await sleep(150);
    c.click(c.$('run-button'));
    check('fixed game B played', await c.play(10, 60000), true);
    const fixedB = sansN(c, 10);
    say('fixed A:', fixedA);
    say('fixed B:', fixedB);
    check('fixed line is deterministic', fixedB, fixedA);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ---------------------------------------------------------------- review */
  async review() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '8', speed: '0' });
    c.click(c.$('run-button'));
    say('== REVIEW (from a running match) ==');
    check('reached 12 plies', await c.play(12, 90000), true);
    const plies = c.t.plyList.length;
    check('running before review', c.t.running, true);
    c.click(c.w.document.querySelector('.move-link[data-ply="5"]'));
    check('entered review at ply 5', c.t.reviewPly, 5);
    check('review bar visible', c.hidden('review-bar'), false);
    check('review label', c.text('review-label'), 'move 3 (Black)');
    check('board shows the reviewed position', c.t.fenShown(), c.t.fenHistory[5]);
    check('one move marked as viewed', c.all('.move-link.viewing').length, 1);
    check('state starts with Reviewing', c.text('game-state').startsWith('Reviewing'), true);
    check('state notes the pause', c.text('game-state').includes('paused'), true);
    check('run button disabled while reviewing', c.$('run-button').disabled, true);
    check('match paused for review', c.t.pausedForReview, true);
    check('not running while reviewing', c.t.running, false);
    c.key('ArrowLeft');
    check('arrow left steps back', c.t.reviewPly, 4);
    check('board follows', c.t.fenShown(), c.t.fenHistory[4]);
    c.key('ArrowRight'); c.key('ArrowRight');
    check('arrow right steps forward', c.t.reviewPly, 6);
    check('board follows forward', c.t.fenShown(), c.t.fenHistory[6]);
    say('eval while reviewing:', c.text('eval-text'));
    c.key('Escape');
    check('escape leaves review', c.t.reviewPly, null);
    check('escape hides the bar', c.hidden('review-bar'), true);
    check('board back to live', c.t.fenShown(), c.t.game.fen());
    check('pausedForReview cleared', c.t.pausedForReview, false);
    check('match resumed automatically', c.t.running, true);
    check('plays on past the old ply count', await c.play(plies + 2, 60000), true);

    say('== REVIEW (from a match paused by hand) ==');
    c.click(c.$('run-button')); await sleep(300);
    check('paused by hand', c.t.running, false);
    c.click(c.w.document.querySelector('.move-link[data-ply="3"]'));
    check('reviewing while paused', c.t.reviewPly, 3);
    check('does not claim to have paused it', c.t.pausedForReview, false);
    c.key('Escape');
    check('left review', c.t.reviewPly, null);
    check('still paused - no surprise resume', c.t.running, false);
    // stepping past the last move returns to live
    const last = c.t.plyList.length;
    c.t.enterReview(last);
    check('reviewing the latest ply', c.t.reviewPly, last);
    c.key('ArrowRight');
    check('stepping past the end returns to live', c.t.reviewPly, null);
    // clicking the evaluation graph jumps to that ply
    c.stubRect(c.$('eval-graph'), { left: 0, width: 200, height: 52 });
    c.$('eval-graph').dispatchEvent(new c.w.MouseEvent('click', { bubbles: true, clientX: 100, clientY: 26 }));
    const series = c.t.evalSeries;
    const wantPly = series[Math.round(0.5 * (series.length - 1))].ply;
    check('graph click opens the matching ply', c.t.reviewPly, wantPly);
    check('graph click shows that position', c.t.fenShown(), c.t.fenHistory[wantPly]);
    check('live button label in watch mode', c.$('live-button').textContent.includes('Back to live'), true);
    c.click(c.$('live-button'));
    check('back to live button works', c.t.reviewPly, null);
    check('still paused after the button', c.t.running, false);
    c.click(c.$('run-button'));
    check('can resume by hand', await c.play(last + 2, 60000), true);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* -------------------------------------------------------------- strength */
  async strength() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '8', speed: '0' });
    say('== STRENGTH ==');
    c.change(c.$('white-strength'), '1320');
    c.change(c.$('black-strength'), '2400');
    check('white strength applied', c.$('white-strength').value, '1320');
    c.click(c.$('run-button'));
    check('two plies played', await c.play(2, 60000), true);
    const opts = c.cmds.filter(x => x.startsWith('setoption name UCI'));
    say('strength options:', opts.join(' | '));
    check('limiting switched on', opts.includes('setoption name UCI_LimitStrength value true'), true);
    check('white elo sent', opts.includes('setoption name UCI_Elo value 1320'), true);
    check('black elo sent', opts.includes('setoption name UCI_Elo value 2400'), true);
    check('go depth used', c.cmds.filter(x => x === 'go depth 8').length > 0, true);
    check('strength cache', JSON.stringify(c.t.strengthCache), JSON.stringify({ limit: 'true', elo: 2400 }));
    // Pause first: New game on a running match resumes it, so a following
    // Start click would pause it again and nothing would ever be played.
    c.click(c.$('run-button')); await sleep(300);
    c.change(c.$('white-strength'), 'max');
    c.change(c.$('black-strength'), 'max');
    c.click(c.$('new-button')); await sleep(150);
    check('new game while paused stays paused', c.t.running, false);
    c.click(c.$('run-button'));
    check('two more plies', await c.play(2, 60000), true);
    check('limiting switched off again', c.cmds.includes('setoption name UCI_LimitStrength value false'), true);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ---------------------------------------------------- handicap (outcome) */
  async handicap() {
    // Strength limiting is only worth having if it is applied to the right
    // player on every search, and if it actually decides games.
    const limitPerGo = (c, from = 0) => {
      const out = []; let cur = null;
      for (const cmd of c.cmds.slice(from)) {
        if (cmd === 'setoption name UCI_LimitStrength value true') cur = 'true';
        else if (cmd === 'setoption name UCI_LimitStrength value false') cur = 'false';
        else if (cmd.startsWith('go ')) out.push(cur);
      }
      return out;
    };
    const c = buildDom(); await c.ready();
    c.watch({ depth: '8', variety: 'off', speed: '0' });
    c.change(c.$('white-strength'), '1320');
    c.change(c.$('black-strength'), 'max');
    say('== HANDICAP: 1320 vs FULL STRENGTH ==');
    c.click(c.$('run-button'));
    check('both sides searched', await c.play(2, 120000), true);
    say('opening moves:', sans(c));
    const limitsA = limitPerGo(c);
    check('White (limited) searched with limiting on', limitsA[0], 'true');
    check('Black (full strength) searched unlimited', limitsA[1], 'false');
    check('Elo 1320 was sent', c.cmds.includes('setoption name UCI_Elo value 1320'), true);

    // Swap the strengths: the limit must follow the colour, not the engine slot.
    c.click(c.$('run-button')); await sleep(300);
    c.change(c.$('white-strength'), 'max');
    c.change(c.$('black-strength'), '1320');
    const mark = c.cmds.length;
    c.click(c.$('new-button'));
    c.click(c.$('run-button'));
    check('both sides searched after the swap', await c.play(2, 120000), true);
    const limitsB = limitPerGo(c, mark);
    check('White (now full strength) searched unlimited', limitsB[0], 'false');
    check('Black (now limited) searched with limiting on', limitsB[1], 'true');

    // Let a whole handicap game play out: the weaker side should not win.
    c.watch({ depth: '6', variety: 'off', speed: '0' });
    c.change(c.$('white-strength'), '1320');
    c.change(c.$('black-strength'), 'max');
    c.click(c.$('run-button')); await sleep(300);
    c.click(c.$('new-button'));
    c.click(c.$('run-button'));
    for (let i = 0; i < 3000 && c.t.running; i++) await sleep(50);
    check('handicap game finished', c.t.running === false && c.t.plyList.length > 0, true);
    say('result:', c.text('game-state'), '/', c.t.resultTag(), 'after', c.t.plyList.length, 'plies');
    check('result tag is valid PGN', ['1-0', '0-1', '1/2-1/2'].includes(c.t.resultTag()), true);
    check('the limited engine did not beat full strength', c.t.resultTag() !== '1-0', true);
    check('pgn records the weaker engine', c.t.buildPgn().includes('(\u22481320 Elo)'), true);
    check('pgn records the stronger engine', c.t.buildPgn().includes('(full strength)'), true);
    check('limiting was re-applied across the game', c.cmds.filter(x => x === 'setoption name UCI_LimitStrength value true').length >= 2, true);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* -------------------------------------------------------------- movetime */
  async movetime() {
    const c = buildDom(); await c.ready();
    c.watch({ limit: 'movetime', movetime: '500', speed: '0' });
    say('== MOVE TIME ==');
    check('depth row hidden', c.hidden('limit-depth-row'), true);
    check('movetime row visible', c.hidden('limit-movetime-row'), false);
    check('clock row hidden', c.hidden('limit-clock-row'), true);
    check('clock chips still hidden', c.hidden('clock-white'), true);
    c.click(c.$('run-button'));
    check('two plies played', await c.play(2, 60000), true);
    check('go movetime sent', c.cmds.filter(x => x === 'go movetime 500').length > 0, true);
    check('no go depth sent', c.cmds.filter(x => x.startsWith('go depth')).length, 0);
    check('no clock sent', c.cmds.filter(x => x.includes('wtime')).length, 0);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ----------------------------------------------------------------- clock */
  async clock() {
    const c = buildDom(); await c.ready();
    const chosen = '180000+2000';
    c.watch({ limit: 'clock', clock: chosen, speed: '0' });
    const [base, inc] = chosen.split('+').map(Number);
    say('== CHESS CLOCK ==');
    check('clock chips visible', c.hidden('clock-white'), false);
    check('elapsed clock hidden', c.hidden('game-clock'), true);
    check('initial clocks', c.text('clock-white') + '/' + c.text('clock-black'), '03:00/03:00');
    c.click(c.$('run-button'));
    await sleep(900);
    check('go uses wtime/btime/inc', c.cmds.filter(x => x.startsWith('go '))[0], `go wtime ${base} btime ${base} winc ${inc} binc ${inc}`);
    check('a clock is ticking', !!c.t.clockTickingSide, true);
    check('clock counting down', c.t.clockState[c.t.clockTickingSide] < base, true);
    check('only the mover counts down', c.t.clockState[c.t.clockTickingSide === 'w' ? 'b' : 'w'], base);
    check('two plies played', await c.play(2, 60000), true);
    say('after 2 plies: white', c.text('clock-white'), 'black', c.text('clock-black'));
    check('clocks changed with increment', c.t.clockState.w !== base || c.t.clockState.b !== base, true);
    c.change(c.$('clock-select'), '60000+0');
    check('clock preset change applies', c.t.clockState.w + c.t.clockState.b <= 60000 * 2 + inc * 4, true);
    // flag fall
    for (let i = 0; i < 300 && !c.t.clockTickingSide; i++) await sleep(20);
    const side = c.t.clockTickingSide;
    if (side) { c.t.clockState[side] = 120; for (let i = 0; i < 300 && !c.t.flagSide; i++) await sleep(20); }
    check('flag fell', c.t.flagSide, side);
    check('running stopped', c.t.running, false);
    check('state names the loser', c.text('game-state'), (side === 'w' ? 'White' : 'Black') + ' loses on time');
    check('result tag', c.t.resultTag(), side === 'w' ? '0-1' : '1-0');
    check('turn text', c.text('turn-text'), 'Game over');
    check('low-clock styling', c.$(side === 'w' ? 'clock-white' : 'clock-black').className.includes('low'), true);
    const settled = c.cmds.length;
    await sleep(500);
    check('no further searches after the flag', c.cmds.slice(settled).filter(x => x.startsWith('go ')).length, 0);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ---------------------------------------------------------------- series */
  async series() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '4', variety: 'off', speed: '0', series: '4' });
    say('== SERIES ==');
    check('badge visible', c.hidden('series-badge'), false);
    check('badge text', c.text('series-badge'), 'Game 1 of 4');
    check('scoreboard hidden before results', c.hidden('scoreboard'), true);
    c.click(c.$('run-button'));
    const t0 = Date.now();
    for (let i = 0; i < 2400 && c.t.seriesIndex < 2; i++) await sleep(50);
    say('games completed:', c.t.seriesIndex, 'in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    check('at least two games finished', c.t.seriesIndex >= 2, true);
    check('scoreboard visible', c.hidden('scoreboard'), false);
    check('result pills rendered', c.all('#series-results .result-pill').length, c.t.seriesResults.length);
    const a = +c.text('score-a'), d = +c.text('score-draws'), b = +c.text('score-b');
    say('score A/draws/B:', a, d, b);
    say('results:', c.t.seriesResults);
    check('score adds up to games played', a + d + b, c.t.seriesResults.length);
    check('colours swapped for game 2', c.t.seriesResults[1].aIsWhite, !c.t.seriesResults[0].aIsWhite);
    check('engine labels follow colours',
      c.text('white-engine-label') + ' / ' + c.text('black-engine-label'),
      (c.t.aIsWhite ? 'White · Engine A' : 'White · Engine B') + ' / ' + (c.t.aIsWhite ? 'Black · Engine B' : 'Black · Engine A'));
    check('badge advanced', c.text('series-badge'), `Game ${Math.min(c.t.seriesIndex + 1, 4)} of 4`);
    for (let i = 0; i < 200 && !c.t.running; i++) await sleep(50);
    check('next game auto-started', c.t.running, true);
    check('game 3 is playing', await c.play(4, 60000), true);
    check('game 3 started from the initial position', c.t.fenHistory[0], START_FEN);
    check('engine hash cleared between games', c.cmds.filter(x => x === 'ucinewgame').length >= 2, true);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ------------------------------------------------------------- seriesEnd */
  async seriesEnd() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '5', variety: 'off', speed: '0', series: '2' });
    say('== SERIES TO COMPLETION ==');
    check('badge starts at game 1', c.text('series-badge'), 'Game 1 of 2');
    check('scoreboard hidden at the start', c.hidden('scoreboard'), true);
    check('series not complete yet', c.t.seriesIndex >= 2, false);
    c.click(c.$('run-button'));
    for (let i = 0; i < 1200 && c.t.seriesIndex < 1; i++) await sleep(50);
    check('first game recorded', c.t.seriesResults.length, 1);
    check('scoreboard visible after game 1', c.hidden('scoreboard'), false);
    check('one result pill', c.all('#series-results .result-pill').length, 1);
    const aWasWhiteInGame1 = c.t.seriesResults[0].aIsWhite;
    say('game 1 result:', c.t.seriesResults[0].tag, '(A was ' + (aWasWhiteInGame1 ? 'White' : 'Black') + ')');
    check('pill title names the colour', c.w.document.querySelector('#series-results .result-pill').title.includes(aWasWhiteInGame1 ? 'A was White' : 'A was Black'), true);
    for (let i = 0; i < 200 && c.text('series-badge') !== 'Game 2 of 2'; i++) await sleep(50);
    check('badge advanced to game 2', c.text('series-badge'), 'Game 2 of 2');
    // the badge flips as soon as game 1 is scored; the next game starts after a
    // short breather, so wait for it to actually be under way. Game 1 starts
    // from boot (empty hash, no reset needed); only the auto-advance goes
    // through startNewGame, which must clear the hash.
    const pliesAtEndOfGame1 = c.t.plyList.length;
    const clearsBefore = c.cmds.filter(x => x === 'ucinewgame').length;
    for (let i = 0; i < 400 && !c.t.running; i++) await sleep(50);
    check('game 2 started by itself', c.t.running, true);
    check('game 2 began from a fresh board', c.t.plyList.length < pliesAtEndOfGame1, true);
    check('hash cleared between the two games', c.cmds.filter(x => x === 'ucinewgame').length, clearsBefore + 1);
    for (let i = 0; i < 1800 && c.t.seriesIndex < 2; i++) await sleep(50);
    check('series finished', c.t.seriesIndex >= 2, true);
    check('match stopped', c.t.running, false);
    check('two results recorded', c.t.seriesResults.length, 2);
    check('two pills', c.all('#series-results .result-pill').length, 2);
    check('colours swapped for game 2', c.t.seriesResults[1].aIsWhite, !aWasWhiteInGame1);
    const a = c.text('score-a'), d = c.text('score-draws'), b = c.text('score-b');
    say('final scoreboard: A', a, 'draws', d, 'B', b, 'results', c.t.seriesResults.map(r => r.tag));
    check('scoreboard adds up to two games', (+a) + (+d) + (+b), 2);
    const state = c.text('game-state');
    say('state:', state);
    const summary = (+a) === (+b)
      ? `Series drawn ${a}\u2013${b} \u00b7 ${d} draw${d === '1' ? '' : 's'}`
      : `Series complete \u00b7 Engine ${(+a) > (+b) ? 'A' : 'B'} wins ${Math.max(+a, +b)}\u2013${Math.min(+a, +b)}`;
    check('series summary shown', state.endsWith(summary), true);
    check('turn text says game over', c.text('turn-text'), 'Game over');
    check('leader row highlighted only for a winner',
      c.$('score-row-a').classList.contains('leader') || c.$('score-row-b').classList.contains('leader'), (+a) !== (+b));
    check('pgn of the last game is round 2', c.t.buildPgn().includes('[Round "2"]'), true);
    const settled = c.cmds.length;
    await sleep(3200);   // longer than the 2.6 s auto-advance delay
    check('no further searches after the series', c.cmds.slice(settled).filter(x => x.startsWith('go ')).length, 0);
    check('no phantom third game', c.t.seriesResults.length, 2);
    const before = c.cmds.length;
    c.click(c.$('run-button'));
    check('restart resets the series index', c.t.seriesIndex, 0);
    check('restart clears the scoreboard', c.hidden('scoreboard'), true);
    check('restart resets the badge', c.text('series-badge'), 'Game 1 of 2');
    check('restart opens a fresh game', c.t.plyList.length, 0);
    check('restart searches', c.cmds.slice(before).some(x => x.startsWith('go ')), true);
    check('colours back to A as White', c.t.aIsWhite, true);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ------------------------------------------------------------- playWhite */
  async playWhite() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '6', speed: '0' });
    c.click(c.$('mode-play')); await sleep(300);
    say('== PLAY MODE (as White) ==');
    check('mode', c.t.mode, 'play');
    check('watch panel hidden', c.hidden('watch-panel'), true);
    check('play panel visible', c.hidden('play-panel'), false);
    check('tab active state', c.$('mode-play').classList.contains('active') && !c.$('mode-watch').classList.contains('active'), true);
    check('state', c.text('game-state'), 'Your move');
    check('turn text', c.text('turn-text'), 'Your move');
    check('engine box marked human', c.$('white-engine-box').classList.contains('human'), true);
    check('white strength select disabled (you)', c.$('white-strength').disabled, true);
    check('black strength select enabled', c.$('black-strength').disabled, false);
    check('white label', c.text('white-engine-label'), 'White · You');
    check('black label', c.text('black-engine-label'), 'Black · Stockfish 19');
    check('board not flipped for White', c.t.flipped, false);
    check('no engine move yet', c.t.plyList.length, 0);
    check('undo disabled with no moves', c.$('undo-button').disabled, true);
    check('play new game button exists', !!c.$('play-new-button'), true);
    c.click(c.sq('e2')); await sleep(60);
    check('square selected', c.t.selectedSquare, 'e2');
    check('selected class rendered', c.all('.square.selected').length, 1);
    check('target dots rendered', c.all('.square.target').length, 2);
    check('board marked playable', c.$('board').classList.contains('playable'), true);
    c.click(c.sq('e4'));
    check('human move applied', sans(c), 'e4');
    check('fenHistory grew', c.t.fenHistory.length, 2);
    check('selection cleared', c.t.selectedSquare, null);
    check('engine search started', c.t.busy, true);
    check('engine replied', await c.play(2, 40000), true);
    check('reply is a black move', c.t.plyList[1].color, 'b');
    say('engine replied:', sans(c));
    check('state back to your move', c.text('game-state'), 'Your move');
    check('undo enabled', c.$('undo-button').disabled, false);
    c.click(c.sq(c.t.plyList[1].to)); await sleep(60);
    check('cannot select engine piece', c.t.selectedSquare, null);
    c.click(c.$('undo-button')); await sleep(200);
    check('undo took back both plies', c.t.plyList.length, 0);
    check('still your move after undo', c.t.game.turn(), 'w');
    await sleep(600);
    check('engine did not move after undo', c.t.plyList.length, 0);
    c.click(c.sq('e2')); c.click(c.sq('e5'));
    check('illegal target ignored', c.t.plyList.length, 0);
    check('illegal target deselects', c.t.selectedSquare, null);
    c.click(c.sq('b1'));
    check('own knight can be selected', c.t.selectedSquare, 'b1');
    c.click(c.sq('b1'));
    check('clicking the same square deselects', c.t.selectedSquare, null);
    // play mode has its own New game button
    c.click(c.sq('e2')); c.click(c.sq('e4'));
    check('a move was played first', c.t.plyList.length >= 1, true);
    c.click(c.$('play-new-button')); await sleep(150);
    check('play new game resets the board', c.t.plyList.length, 0);
    check('play new game keeps play mode', c.t.mode, 'play');
    check('play new game keeps your side', c.t.humanSide, 'w');
    check('it is your move again', c.text('game-state'), 'Your move');
    check('board is back to the start', c.t.fenShown(), START_FEN);
    c.click(c.$('mode-watch'));
    check('back in watch mode', c.t.mode, 'watch');
    check('fresh game on mode switch', c.t.plyList.length, 0);
    c.click(c.sq('e2'));
    check('board clicks ignored in watch mode', c.t.selectedSquare, null);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ------------------------------------------------------------- playBlack */
  async playBlack() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '6', speed: '0' });
    c.click(c.$('mode-play')); await sleep(200);
    c.change(c.$('side-select'), 'b'); await sleep(200);
    say('== PLAY MODE (as Black) ==');
    check('human side', c.t.humanSide, 'b');
    check('board flipped', c.t.flipped, true);
    check('top-left coordinate is rank 1 when flipped', c.w.document.querySelector('#board .coord').textContent, '1');
    check('black box marked human', c.$('black-engine-box').classList.contains('human'), true);
    check('black strength disabled', c.$('black-strength').disabled, true);
    check('engine opened as White', await c.play(1, 40000), true);
    check('first ply is white', c.t.plyList[0] && c.t.plyList[0].color, 'w');
    say('engine opened:', sans(c));
    check('state is your move', c.text('game-state'), 'Your move');
    const target = c.sq('e7') ? 'e7' : 'd7';
    c.click(c.sq(target));
    check('reply square selected', c.t.selectedSquare, target);
    c.click(c.sq(target === 'e7' ? 'e5' : 'd5'));
    check('human reply applied', c.t.plyList.length, 2);
    check('human ply is black', c.t.plyList[1].color, 'b');
    check('engine answered again', await c.play(3, 40000), true);
    c.click(c.$('undo-button')); await sleep(300);
    check('undo left one white ply', c.t.plyList.length, 1);
    check('human to move after undo', c.t.game.turn(), 'b');
    await sleep(700);
    check('engine did not move on its own after undo', c.t.plyList.length, 1);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ----------------------------------------------------- playInteractions */
  async playInteractions() {
    // Saved preferences can drop you straight into play mode while the search
    // limit is still "Chess clock" — a combination the watch UI cannot produce
    // by clicking, so it is easy to break without noticing.
    const c = buildDom({
      mode: 'play', humanSide: 'w', limit: 'clock', clock: '60000+0',
      depth: '6', speed: '0', variety: 'normal', series: '1', movetime: '1000',
      whiteStrength: 'max', blackStrength: 'max',
    });
    await c.ready();
    say('== PLAY MODE x CLOCK PREFERENCE ==');
    check('restored into play mode', c.t.mode, 'play');
    check('watch panel hidden, so the clock preset is unreachable', c.hidden('watch-panel'), true);
    check('clock preference really was restored', c.$('limit-select').value, 'clock');
    check('clock chips hidden in play mode', c.hidden('clock-white') && c.hidden('clock-black'), true);
    check('elapsed clock shown instead', c.hidden('game-clock'), false);
    check('clock state initialised, not 0/0', c.t.clockState.w + c.t.clockState.b, 120000);
    check('no clock is ticking', c.t.clockTickingSide, null);
    c.click(c.sq('e2')); c.click(c.sq('e4'));
    check('human move applied', sans(c), 'e4');
    check('engine answered', await c.play(2, 40000), true);
    check('engine searched by depth', c.cmds.filter(x => x.startsWith('go depth 6')).length > 0, true);
    check('no clock-based search was sent', c.cmds.filter(x => x.includes('wtime')).length, 0);
    check('no movetime search either', c.cmds.filter(x => x.startsWith('go movetime')).length, 0);
    check('opening variety stays off in play mode', c.cmds.filter(x => x.includes('MultiPV value 4')).length, 0);
    check('still no clock running after two plies', c.t.clockTickingSide, null);
    check('clock never counted down', c.t.clockState.w + c.t.clockState.b, 120000);
    check('nobody was flagged', c.t.flagSide, null);

    say('== REVIEW INSIDE PLAY MODE ==');
    const link = c.w.document.querySelector('.move-link[data-ply="1"]');
    check('move link exists', !!link, true);
    c.click(link);
    check('entered review', c.t.reviewPly, 1);
    check('review bar visible', c.hidden('review-bar'), false);
    check('review label', c.text('review-label'), 'move 1 (Black)');
    check('play-mode wording on the exit button', c.text('live-button'), '\u21a9 Back to board');
    check('board shows the reviewed position', c.t.fenShown(), c.t.fenHistory[1]);
    check('undo disabled while reviewing', c.$('undo-button').disabled, true);
    check('board not clickable while reviewing', c.$('board').classList.contains('playable'), false);
    const pliesBefore = c.t.plyList.length;
    c.click(c.sq('d2')); c.click(c.sq('d4'));
    check('no selection while reviewing', c.t.selectedSquare, null);
    check('no move played while reviewing', c.t.plyList.length, pliesBefore);
    await sleep(600);
    check('engine did not move while reviewing', c.t.plyList.length, pliesBefore);
    c.click(c.$('live-button'));
    check('left review', c.t.reviewPly, null);
    check('review bar hidden', c.hidden('review-bar'), true);
    check('board back to the live position', c.t.fenShown(), c.t.game.fen());
    c.click(c.sq('d2'));
    check('board playable again', c.t.selectedSquare, 'd2');
    c.click(link);
    check('re-entered review', c.t.reviewPly, 1);
    c.key('Escape');
    check('escape left review', c.t.reviewPly, null);
    check('escape hid the bar', c.hidden('review-bar'), true);
    c.click(c.sq('d2')); c.click(c.sq('d4'));
    check('human can still move', c.t.plyList.length, pliesBefore + 1);
    check('engine answered again', await c.play(pliesBefore + 2, 40000), true);
    check('no clock was started by any of it', c.t.clockTickingSide, null);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ------------------------------------------------------------- promotion */
  async promotion() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '6', speed: '0' });
    c.click(c.$('mode-play')); await sleep(200);
    c.t.loadPosition('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'w');
    say('== PROMOTION ==');
    check('position loaded', c.t.game.turn(), 'w');
    c.click(c.sq('a7')); await sleep(60);
    check('pawn selected', c.t.selectedSquare, 'a7');
    check('promotion target marked', c.sq('a8').classList.contains('target'), true);
    c.click(c.sq('a8'));
    check('picker opened', c.hidden('promotion-picker'), false);
    check('pending promotion recorded', JSON.stringify(c.t.pendingPromotion), JSON.stringify({ from: 'a7', to: 'a8' }));
    check('four choices', c.all('.promotion-choice').length, 4);
    check('no move applied yet', c.t.plyList.length, 0);
    c.key('Escape'); await sleep(60);
    check('escape closes the picker', c.hidden('promotion-picker'), true);
    check('pending cleared', c.t.pendingPromotion, null);
    check('still no move applied', c.t.plyList.length, 0);
    c.click(c.sq('a7')); c.click(c.sq('a8'));
    const buttons = c.all('.promotion-choice');
    check('picker reopened', c.hidden('promotion-picker'), false);
    const labels = buttons.map(b => b.getAttribute('aria-label'));
    say('promotion order:', labels.join(' | '));
    check('queen is offered first', labels[0], 'Promote to queen');
    check('all four pieces offered', labels.slice().sort().join(','),
      'Promote to bishop,Promote to knight,Promote to queen,Promote to rook');
    c.click(buttons[1]);
    check('underpromotion applied', sans(c), 'a8=R');
    check('picker closed after choice', c.hidden('promotion-picker'), true);
    check('promotion recorded on the ply', c.t.plyList[0].promotion, 'r');
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* ------------------------------------------------------------------- pgn */
  async pgn() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '8', variety: 'normal', speed: '0' });
    c.change(c.$('white-strength'), '1800');
    c.click(c.$('run-button'));
    check('ten plies played', await c.play(10, 90000), true);
    c.click(c.$('run-button')); await sleep(300);
    say('== PGN ==');
    const fenBefore = c.t.game.fen(), pliesBefore = c.t.plyList.length;
    c.click(c.$('pgn-button'));
    for (let i = 0; i < 100 && !c.copied.length; i++) await sleep(20);
    await sleep(40);   // the clipboard stub resolves at once, so yield a microtask
    check('clipboard written', c.copied.length, 1);
    check('button feedback', c.text('pgn-button'), 'Copied \u2713');
    check('position untouched', c.t.game.fen(), fenBefore);
    check('plies untouched', c.t.plyList.length, pliesBefore);
    const pgn = c.copied[0] || '';
    const h2 = name => (pgn.match(new RegExp(`\\[${name} "([^"]*)"\\]`)) || [])[1];
    check('Event', h2('Event'), 'Engine Room · Stockfish vs Stockfish');
    check('White', h2('White'), 'Engine A · Stockfish 19 Lite (\u22481800 Elo)');
    check('Black', h2('Black'), 'Engine B · Stockfish 19 Lite (full strength)');
    check('Result', h2('Result'), '*');
    check('PlyCount', h2('PlyCount'), String(pliesBefore));
    check('SearchLimit', h2('SearchLimit'), '8 ply');
    check('OpeningVariety', h2('OpeningVariety'), 'Varied');
    check('Round', h2('Round'), '1');
    check('Site', h2('Site'), 'this browser');
    check('Date looks like PGN', /^\d{4}\.\d{2}\.\d{2}$/.test(h2('Date') || ''), true);
    say('Opening header:', h2('Opening'));
    check('opening header matches the label', h2('Opening'), c.t.openingName());
    const movetext = pgn.split('\n\n').slice(1).join('\n\n').trim();
    check('movetext ends with result', movetext.endsWith('*'), true);
    say('first line of movetext:', movetext.split('\n')[0]);
    check('movetext starts at move 1', movetext.startsWith('1. '), true);
    await sleep(2000);
    check('button label restored', c.text('pgn-button'), '\u29c9 PGN');
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* --------------------------------------------- pgn fallback paths (new) */
  async pgnNoMoves() {
    const c = buildDom(); await c.ready();
    say('== PGN WITH NO MOVES ==');
    c.click(c.$('pgn-button')); await sleep(50);
    check('refuses with no moves', c.text('pgn-button'), 'No moves yet');
    check('nothing copied', c.copied.length, 0);
    check('still not running', c.t.running, false);
    await sleep(2000);
    check('label restored', c.text('pgn-button'), '\u29c9 PGN');
    check('no errors', c.errs.length, 0);
  },

  async pgnDownload() {
    // Clipboard blocked, download available: jsdom has no URL.createObjectURL,
    // so provide one and watch the anchor click.
    const c = buildDom(null, { noClipboard: true }); await c.ready();
    say('== PGN WHEN THE CLIPBOARD IS BLOCKED ==');
    check('no clipboard API', !!c.w.navigator.clipboard, false);
    const blobs = [];
    c.w.URL.createObjectURL = b => { blobs.push(b); return 'blob:fake-' + blobs.length; };
    c.w.URL.revokeObjectURL = () => {};
    const clicks = [];
    c.w.HTMLAnchorElement.prototype.click = function () { clicks.push({ download: this.download, href: this.href }); };
    c.watch({ depth: '6', speed: '0' });
    c.click(c.$('run-button'));
    check('played six plies', await c.play(6, 60000), true);
    c.click(c.$('run-button')); await sleep(200);
    const fenBefore = c.t.game.fen(), pliesBefore = c.t.plyList.length, paused = c.t.running;
    c.click(c.$('pgn-button'));
    for (let i = 0; i < 150 && !clicks.length; i++) await sleep(20);
    check('download fallback used', clicks.length, 1);
    check('nothing was copied', c.copied.length, 0);
    check('button says saved', c.text('pgn-button'), 'Saved .pgn');
    const today = new Date().toISOString().slice(0, 10);
    check('download filename', clicks[0] && clicks[0].download, `engine-room-${today}.pgn`);
    check('download href is the blob url', clicks[0] && clicks[0].href, 'blob:fake-1');
    const text = blobs.length ? await blobs[0].text() : '';
    check('file holds the same pgn as buildPgn', text, c.t.buildPgn());
    check('file has a Result header', /\[Result "[^"]*"\]/.test(text), true);
    check('file has movetext', /\n\n1\. /.test(text), true);
    check('game untouched by the export', c.t.game.fen(), fenBefore);
    check('plies untouched', c.t.plyList.length, pliesBefore);
    check('still paused', c.t.running, paused);
    await sleep(2000);
    check('button label restored', c.text('pgn-button'), '\u29c9 PGN');
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  async pgnBothFail() {
    const c = buildDom(null, { noClipboard: true }); await c.ready();
    say('== PGN WHEN CLIPBOARD *AND* DOWNLOAD BOTH FAIL ==');
    c.w.URL.createObjectURL = () => { throw new Error('blocked'); };
    c.watch({ depth: '6', speed: '0' });
    c.click(c.$('run-button'));
    check('played four plies', await c.play(4, 60000), true);
    c.click(c.$('run-button')); await sleep(200);
    const plies = c.t.plyList.length;
    c.click(c.$('pgn-button'));
    for (let i = 0; i < 150 && c.text('pgn-button') === '\u29c9 PGN'; i++) await sleep(20);
    check('reports the failure', c.text('pgn-button'), 'Copy failed');
    check('failure was logged once', c.errs.filter(e => e.startsWith('console.error')).length, 1);
    check('nothing copied', c.copied.length, 0);
    check('game survived the failure', c.t.plyList.length, plies);
    check('app still responds', (c.click(c.$('new-button')), c.t.plyList.length), 0);
    check('no uncaught errors', c.errs.filter(e => !e.startsWith('console.error')).length, 0);
  },

  /* ------------------------------------------------ engine failure paths */
  async enginefail() {
    say('== WORKER CONSTRUCTOR THROWS ==');
    class Boom { constructor() { throw new Error('no worker here'); } }
    const c = buildDom(null, { Worker: Boom });
    await sleep(200);
    check('status says it failed', c.text('engine-status'), 'Engine failed to start');
    check('state explains why', c.text('game-state').includes('Could not create the engine worker'), true);
    check('run button disabled', c.$('run-button').disabled, true);
    check('run button label', c.$('run-button').textContent, 'Engine unavailable');
    check('engineReady false', c.t.engineReady, false);
    check('engineFailed true', c.t.engineFailed, true);
    check('failure logged', c.errs.some(e => e.startsWith('console.error')), true);
    check('board still rendered', c.all('#board .square').length, 64);
    c.click(c.$('run-button')); await sleep(100);
    check('clicking start is a no-op', c.t.running, false);
    check('still no crash', c.all('#board .piece-svg').length, 32);

    say('== WORKER REPORTS AN ERROR (missing wasm) ==');
    class Silent { constructor() { this.onmessage = null; this.onerror = null; } postMessage() {} terminate() {} }
    const c2 = buildDom(null, { Worker: Silent });
    await sleep(150);
    check('still loading before the error', c2.text('engine-status'), 'Loading Stockfish…');
    check('one worker was created', c2.workers.length, 1);
    c2.workers[0].onerror({ message: '404' });
    await sleep(100);
    check('status says it failed', c2.text('engine-status'), 'Engine failed to start');
    check('state names the files', c2.text('game-state').includes('Could not load Stockfish'), true);
    check('run button disabled', c2.$('run-button').disabled, true);
    check('engineFailed true', c2.t.engineFailed, true);
    c2.click(c2.$('run-button')); await sleep(100);
    check('start does nothing', c2.t.running, false);
    check('no searches sent', c2.cmds.filter(x => x.startsWith('go ')).length, 0);

    say('== OPENED FROM file:// ==');
    const c3 = buildDom(null, { url: 'file:///tmp/index.html', Worker: Silent });
    await sleep(200);
    check('origin is null', c3.w.location.origin, 'null');
    check('warns about the sandboxed preview', c3.text('game-state').includes('sandboxed file preview'), true);
    check('no worker was even attempted', c3.workers.length, 0);
    check('run button disabled', c3.$('run-button').disabled, true);
    check('no errors thrown', c3.errs.filter(e => !e.startsWith('console.error')).length, 0);
  },

  /* ----------------------------------------------------------------- prefs */
  async prefs() {
    const seed = {
      depth: '14', speed: '1300', variety: 'wide', series: '4', limit: 'movetime', movetime: '2000',
      clock: '300000+0', whiteStrength: '1800', blackStrength: '2600', mode: 'play', humanSide: 'b',
    };
    const c = buildDom(seed); await c.ready();
    say('== PREFERENCES RESTORED ==');
    check('depth restored', c.$('depth-range').value, '14');
    check('depth pill', c.text('depth-value'), '14 ply');
    check('speed restored', c.$('speed-select').value, '1300');
    check('variety restored', c.$('variety-select').value, 'wide');
    check('series restored', c.$('series-select').value, '4');
    check('limit restored', c.$('limit-select').value, 'movetime');
    check('movetime restored', c.$('movetime-select').value, '2000');
    check('clock restored', c.$('clock-select').value, '300000+0');
    check('white strength restored', c.$('white-strength').value, '1800');
    check('black strength restored', c.$('black-strength').value, '2600');
    check('mode restored', c.t.mode, 'play');
    check('side restored', c.t.humanSide, 'b');
    check('side select shows it', c.$('side-select').value, 'b');
    check('play panel visible', c.hidden('play-panel'), false);
    check('board flipped for black', c.t.flipped, true);
    check('engine ready with restored prefs', c.t.engineReady, true);
    // changing a control writes through
    c.change(c.$('side-select'), 'w');
    const saved = JSON.parse(c.w.localStorage.getItem('engine-room-prefs-v2'));
    check('saved keys', Object.keys(saved).sort().join(','), 'blackStrength,clock,depth,humanSide,limit,mode,movetime,series,speed,variety,whiteStrength');
    check('saved side', saved.humanSide, 'w');
    check('saved depth', saved.depth, '14');
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  async prefsBogus() {
    const bogus = {
      depth: '99', speed: 'nope', variety: 'huge', series: '7', limit: 'warp', movetime: '12',
      clock: '1+1', whiteStrength: '900', blackStrength: 'x', mode: 'nope', humanSide: 'x',
    };
    const c = buildDom(bogus); await c.ready();
    say('== BOGUS PREFERENCES IGNORED ==');
    check('bogus mode ignored', c.t.mode, 'watch');
    check('bogus side ignored', c.t.humanSide, 'w');
    check('bogus depth ignored', c.$('depth-range').value, '10');
    check('bogus speed ignored', c.$('speed-select').value, '650');
    check('bogus variety ignored', c.$('variety-select').value, 'normal');
    check('bogus series ignored', c.$('series-select').value, '1');
    check('bogus limit ignored', c.$('limit-select').value, 'depth');
    check('bogus movetime ignored', c.$('movetime-select').value, '1000');
    check('bogus clock ignored', c.$('clock-select').value, '180000+2000');
    check('bogus strengths ignored', c.$('white-strength').value + '/' + c.$('black-strength').value, 'max/max');
    check('engine starts anyway', c.t.engineReady, true);
    c.change(c.$('series-select'), '6');
    check('saved series', JSON.parse(c.w.localStorage.getItem('engine-room-prefs-v2')).series, '6');
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  async prefsCorrupt() {
    // No real engine here on purpose: this only proves boot survives junk in
    // localStorage, and several DOMs in one process would share one engine.
    class Silent { constructor() { this.onmessage = null; this.onerror = null; } postMessage() {} terminate() {} }
    say('== CORRUPT STORAGE ==');
    for (const junk of ['{not json', '"a string"', '42', 'true', '[1,2]', 'null', '']) {
      const c = buildDom(junk, { Worker: Silent });
      await sleep(120);
      const label = JSON.stringify(junk).slice(0, 14);
      check(`${label}: no crash`, c.errs.filter(e => !e.startsWith('console.error')).length, 0);
      check(`${label}: defaults kept`, c.$('depth-range').value + '/' + c.$('speed-select').value + '/' + c.$('variety-select').value, '10/650/normal');
      check(`${label}: watch mode`, c.t.mode, 'watch');
      check(`${label}: 64 squares`, c.all('#board .square').length, 64);
    }
    // and storage that throws on access
    const c = buildDom(null, { Worker: Silent });
    c.w.localStorage.getItem = () => { throw new Error('denied'); };
    await sleep(60);
    check('throwing storage does not break boot', c.errs.filter(e => !e.startsWith('console.error')).length, 0);
  },

  /* -------------------------------------------------------------- gameover */
  async gameover() {
    const c = buildDom(); await c.ready();
    say('== GAME OVER LABELS ==');
    const cases = [
      ['checkmate', 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', 'Black wins by checkmate', '0-1'],
      ['stalemate', '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'Draw by stalemate', '1/2-1/2'],
      ['insufficient material', '8/8/8/4k3/8/8/8/K7 w - - 0 1', 'Draw · insufficient material', '1/2-1/2'],
      ['fifty-move rule', '8/8/8/4k3/8/8/8/R3K2R w - - 100 80', 'Draw · fifty-move rule', '1/2-1/2'],
    ];
    for (const [name, fen, wantState, wantTag] of cases) {
      c.t.loadPosition(fen);
      check(name + ' state', c.text('game-state'), wantState);
      check(name + ' result tag', c.t.resultTag(), wantTag);
      check(name + ' turn text', c.text('turn-text'), 'Game over');
      check(name + ' stopped', c.t.running, false);
      // Start on a finished game must begin a fresh one (asserted synchronously:
      // commands are posted inside the click handler itself).
      const before = c.cmds.length;
      c.click(c.$('run-button'));
      check(name + ': start opens a fresh game and searches',
        c.t.plyList.length === 0 && c.cmds.slice(before).some(x => x.startsWith('go ')), true);
      c.click(c.$('run-button'));            // pause the fresh game again
      await sleep(300);
      const quiet = c.cmds.length;
      c.t.loadPosition(fen);                 // back to the finished position
      await sleep(300);
      check(name + ': finished position never searches', c.cmds.slice(quiet).filter(x => x.startsWith('go ')).length, 0);
    }
    // repetition needs a real move sequence
    const g = c.t.game;
    g.reset();
    c.t.loadPosition(START_FEN);
    ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach(san => {
      g.move(san); c.t.plyList.push({ san, from: '', to: '', color: g.turn() });
    });
    c.t.fenHistory = [g.fen()];
    c.t.updateMatchInfo();
    check('threefold repetition state', c.text('game-state'), 'Draw by repetition');
    check('threefold result tag', c.t.resultTag(), '1/2-1/2');
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },

  /* -------------------------------------------------------------- fullgame */
  async fullgame() {
    const c = buildDom(); await c.ready();
    c.watch({ depth: '8', variety: 'normal', speed: '0' });
    say('== FULL GAME ==');
    c.click(c.$('run-button'));
    const t0 = Date.now();
    for (let i = 0; i < 6000 && c.t.running; i++) await sleep(50);
    check('game finished', c.t.running === false && c.t.plyList.length > 0, true);
    say('plies:', c.t.plyList.length, 'in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    say('state:', c.text('game-state'));
    say('result:', c.t.resultTag());
    check('running stopped', c.t.running, false);
    check('button re-enabled', c.$('run-button').disabled, false);
    check('eval points for the whole game', c.t.evalSeries.length >= c.t.plyList.length - 2, true);
    check('fenHistory consistent', c.t.fenHistory.length, c.t.plyList.length + 1);
    check('graph still valid', c.all('#eval-graph path').length, 2);
    const pgn = c.t.buildPgn();
    check('pgn result header', pgn.includes(`[Result "${c.t.resultTag()}"]`), true);
    check('pgn ends with the result', pgn.trim().endsWith(c.t.resultTag()), true);
    say('pgn tail:', pgn.trim().split('\n').pop().slice(-70));
    c.click(c.$('run-button'));
    check('restart begins a new game', await c.play(2, 60000), true);
    say('errors:', c.errs.length ? c.errs.join(' | ') : 'none');
  },
};

(async () => {
  const name = process.argv[2];
  const fn = scenarios[name];
  fs.mkdirSync(REPORTS, { recursive: true });
  if (!fn) {
    fs.writeFileSync(path.join(REPORTS, `out-${name}.txt`),
      `  unknown scenario "${name}"\nknown: ${Object.keys(scenarios).join(', ')}\n`);
    process.exit(2);
  }
  const t0 = Date.now();
  try { await fn(); } catch (e) { R.push('  SCENARIO THREW: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n') : e)); }
  const fails = failureCount();
  R.push(`  [${name}] ${((Date.now() - t0) / 1000).toFixed(1)}s, ${fails} failure(s)`);
  fs.writeFileSync(path.join(REPORTS, `out-${name}.txt`), R.join('\n') + '\n');
  process.exit(fails ? 1 : 0);
})();

module.exports = { scenarios };
