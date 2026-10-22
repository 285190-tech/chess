# Engine Room

A static chess app that runs entirely in your browser: no backend, no accounts, no uploads. Stockfish 19 plays locally in a web worker from the files in this repository.

Two modes, one switch at the top of the page:

- **Watch a match** — two engines play each other. Give them different strengths or time controls, run a series of games with colours swapping, and follow a live scoreboard.
- **Play Stockfish** — pick a side, move the pieces, and the engine answers.

Everything else is shared: the same board, the same move history, the same evaluation graph, the same PGN export.

## Keep these files together

Put all three files in the same directory (the repository root is easiest):

- `index.html` — the whole app (styles, board, controls, chess.js)
- `stockfish-19-lite-single.js` — Stockfish.js 19.0.1 lite, single-threaded worker
- `stockfish-19-lite-single.wasm` — the matching WebAssembly binary

The two Stockfish files are a matched pair. Don't rename them unless you also update the worker path in `index.html`.

## Watch mode

| Control | What it does |
| --- | --- |
| **Start watching / Pause match** | Starts or pauses the automated game. A click before the engine is ready is queued. |
| **New game** | Resets the board and the engine's hash table. If a match is running it immediately starts over; if it is paused it stays paused. |
| **Search limit** | *Fixed depth* (4–18 ply), *Time per move* (0.5 s / 1 s / 2 s / 5 s), or a real *Chess clock*. |
| **Strength** (one per engine) | *Full strength*, or a limited rating from ≈ 1320 to ≈ 2800 Elo. |
| **Series** | *Single game*, or 2 / 4 / 6 / 10 games played back to back. |
| **Move pacing** | Delay between moves: Instant, Quick, Relaxed (default), Slow. Watch mode only — in play mode the engine answers after a short fixed pause instead. |
| **Opening variety** | How much the engines may deviate in the opening — see below. |
| **↻ Flip board** (`F`) | Turns the board around. |
| **⧉ PGN** | Copies the game so far as PGN to the clipboard; if the clipboard is blocked it downloads a `.pgn` file instead. |

### Uneven matches

Each engine has its own strength selector, so you can set up handicapped matches — for example Engine A at ≈ 1800 against Engine B at full strength. A limited rating is sent to the engine as `UCI_LimitStrength` plus `UCI_Elo`; full strength turns limiting off. The settings are applied per engine and cached, so they are only re-sent when they actually change, and they are recorded in the PGN headers.

Note that Stockfish's own floor is ≈ 1320 Elo: below that the option is clamped, and the rating is an approximation rather than a measured one.

### Chess clock

With *Chess clock* selected, both sides get a real countdown (1 min, 3 min + 2 s, 5 min or 10 min) shown as chips beside the board. Only the side to move loses time; the increment is added after that side's move, and the search is given the remaining time through `go wtime … btime … winc … binc …`. A clock under 20 s turns red. When a flag falls the match stops at once — no further searches are sent — and the game is scored as a loss on time (`White loses on time` / `0-1`).

### Series and scoreboard

Choose 2, 4, 6 or 10 games and the match plays itself: as soon as a game ends, the colours swap and the next one starts a moment later. The badge above the board reads *Game 3 of 4*, the scoreboard tallies Engine A wins, draws and Engine B wins, and one pill per finished game records the result with the colour that engine had. The scoreboard only appears once there is something to show.

## Reviewing a game

Click any move in the history and the board jumps to that position:

- the move list marks the ply you are looking at, and a bar appears above the board reading *Reviewing move 3 (Black)* with a **↩ Back to live** button;
- `←` and `→` step through the game, `Escape` (or the button) returns to the live position — stepping past the last move does the same;
- the evaluation graph is clickable too: click anywhere along it to open the position at that point in the game;
- reviewing pauses the match, and leaving review resumes it exactly where it was.

The evaluation graph plots the engine's assessment of every position of the game (white's view above the axis, black's below), with a caret on the position currently shown. Beside it are the opening name, the move count, the current evaluation, search depth and nodes per second.

Opening names come from a built-in table of 364 lines; the longest prefix that matches the game's moves wins, so *e4 e6 d4 d5 Nc3 Nf6 e5* is reported as "French, Steinitz Variation". Until a known line is reached the label simply says the game is waiting for its first moves.

## Play mode

Switch to **Play Stockfish** and pick your side. Playing Black flips the board and lets the engine open the game.

- Click one of your pieces: legal destinations are dotted, captures are ringed. Click a dot to move, click the piece again to deselect, click an empty square that is not a target to cancel the selection.
- Clicking an opponent's piece never moves it — you cannot play for the engine — it just cancels your selection.
- Pawn moves to the last rank open a promotion picker with all four pieces; `Escape` cancels it and nothing is played until you choose.
- **Take back move** removes your move *and* the engine's reply, so it is always your turn again. The engine never moves on its own after a take-back.
- Your side's strength selector is disabled and labelled *You*; the engine's selector still works, so you can weaken it mid-game.

Opening variety is deliberately switched off in play mode: you are playing one game, and a randomised opening would just be noise. Search limit and strength still apply to the engine; the pacing selector does not (the reply comes after a short fixed delay, so the game keeps a natural rhythm).

## Why "Opening variety" exists

A fixed-depth search is deterministic. Given the same position, the same depth and a clean hash table, Stockfish always answers with the same move — so without variety, every single game would replay exactly the same moves forever, and **New game** would be pointless.

With variety on, the page asks the engine for several root moves at once (`setoption name MultiPV`) during the opening and picks at random between the moves it rates as nearly equal:

- **Fixed line** — always the engine's top move. Every game is identical (useful for comparing depth, strength or pacing).
- **Varied** *(default)* — top 4 moves within 0.40 pawns of each other, for the first 10 plies.
- **Very varied** — top 5 moves within 0.90 pawns, for the first 16 plies.

Two guards keep the randomised openings looking like real chess:

- the tolerance shrinks with depth (a 4-ply search is noisy, so candidates must agree more closely there than at 12 ply);
- candidates are filtered for basic opening hygiene — no early queen sorties, no rook-pawn pushes, no knights to the rim, no `f3`/`f6` — and only if *every* near-equal move fails that filter does the raw list get used, so variety is never lost.

After the opening window the engines play their best move again (and `MultiPV` drops back to 1), so the games stay sound — only the opening changes. The evaluation bar always shows the engine's assessment of the position (its top move), never one of the alternative opening candidates.

Every new game also sends `ucinewgame`, clearing the engine's hash table. Without that, positions remembered from the previous game can change move ordering enough to alter a fixed-depth choice — which would quietly break "Fixed line" and give the games of a series different starting conditions.

## PGN export

**⧉ PGN** copies the game so far. Exporting never disturbs a live game: the position, the clocks and a paused/running match all come out the other side unchanged.

The headers describe what was actually played:

```
[Event "Engine Room · Stockfish vs Stockfish"]
[Site "this browser"]
[Date "2026.10.22"]
[Round "3"]
[White "Engine A · Stockfish 19 Lite (≈1800 Elo)"]
[Black "Engine B · Stockfish 19 Lite (full strength)"]
[Result "1-0"]
[PlyCount "87"]
[Opening "French, Steinitz Variation"]
[SearchLimit "10 ply"]
[OpeningVariety "Varied"]
```

In play mode the event becomes *Human vs Stockfish* and your side is given as `You`. `Round` follows the series, `Result` is `*` while the game is unfinished, and `SearchLimit` records depth, time per move or the clock setting.

## Settings are remembered

Depth, pacing, variety, search limit and its setting, both strengths, series length, mode and your chosen side are saved in `localStorage` (`engine-room-prefs-v2`) and restored on the next visit. Invalid or stale saved values are ignored rather than trusted, so a hand-edited or older entry falls back to the defaults.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `←` / `→` | Step back and forward through the game (ignored while a button has focus, so you can still operate controls) |
| `Escape` | Close the promotion picker, or return from review to the live position |
| `F` | Flip the board |

Shortcuts are ignored while you are typing in a field or selecting an option.

## Publish with GitHub Pages

1. Commit the three files to your repository's default branch.
2. Open **Settings → Pages** and publish from the default branch, using `/(root)`.
3. Open the Pages URL. The engine may take a few seconds to initialize on first load.

Pages serves `.wasm` as `application/wasm`, which the engine needs for streaming compilation. If you host it yourself, make sure your server sends that content type for `.wasm` or the engine will fail to start.

## Local testing

Serve the folder over HTTP (for example, `python3 -m http.server 8000`) rather than opening `index.html` directly. The browser must be able to load the matching WASM file beside the worker, and a `file://` page blocks the worker entirely — the app says so instead of failing silently.

### What has been verified

The app was exercised headlessly — jsdom driving the real page script, backed by the real Stockfish build, one engine per process so instances cannot interfere — across 16 scenarios and 315 assertions, with no console errors in any of them:

- engine startup (`uci` → `uciok` → `isready` → `readyok`) and the ready/pending-start queue
- a 12-ply watch game: history, move count, opening name, evaluation graph, `MultiPV` raised for the opening and dropped afterwards
- variety on: consecutive games differ. Fixed line: two games in one engine session replay the same moves exactly
- review: clicking a move shows that position, the arrow keys step, `Escape` returns to live, clicking the graph opens the matching ply, the match pauses and then resumes
- strength: `UCI_LimitStrength` / `UCI_Elo` sent per engine and cached, correct `go depth`
- time per move (`go movetime 500`) and the chess clock (`go wtime … btime … winc … binc …`): clocks count down for the side to move, the increment lands on the mover, and a flag fall stops the match with the right result and no further searches
- series: colours swap, scoreboard and result pills match the games played, the badge advances, and the next game starts on its own from the initial position with a cleared hash
- a whole series played to completion, unattended: both games finish, the final tally and summary are consistent with the results (a 1–1 series reads "Series drawn 1–1"), no search is requested once the series is over, and Start replays it from scratch
- play mode as White and as Black: the board flips, the engine opens, selection and target dots render, an illegal target only cancels the selection, the engine answers, and take-back removes both plies without letting the engine move again
- play mode crossed with a saved chess-clock preference (a combination the watch UI cannot produce by clicking): the clock neither ticks nor displays, and the engine searches by depth instead of being handed an empty clock
- review inside play mode: the board freezes on the position you clicked, squares and **Undo** are disabled, the engine does not move while you look back, and both the button (*↩ Back to board*) and `Escape` return you to a playable board
- promotion: the picker opens on the last rank, `Escape` cancels it, and an underpromotion is recorded on the ply
- PGN export: clipboard write, headers reflecting mode/strength/round/search limit/variety, and a live game left byte-identical afterwards
- game-over labels: checkmate, stalemate, insufficient material, fifty-move rule, repetition — plus that a finished position never triggers a search and that Start opens a fresh game
- full games to completion (118-ply repetition draw, 53-ply draw, and earlier 194-ply checkmate with a rook underpromotion), each with a valid PGN and correct `Result`
- preference save/restore including mode and side, and rejection of every invalid saved value

## Open-source credits

- Stockfish.js 19.0.1 — GPL-3.0. License text and source links are included in the page.
- chess.js 1.4.0 — MIT. License text and source link are included in the page.
