# Engine Room — Stockfish vs Stockfish

A static chess match viewer. Two copies of Stockfish 19 play each other in your browser: no backend, no accounts, no uploads. The engine runs locally in a web worker from the files in this repository.

## Keep these files together

Put all three files in the same directory (the repository root is easiest):

- `index.html` — the whole app (styles, board, controls, chess.js)
- `stockfish-19-lite-single.js` — Stockfish.js 19.0.1 lite, single-threaded worker
- `stockfish-19-lite-single.wasm` — the matching WebAssembly binary

The two Stockfish files are a matched pair. Don't rename them unless you also update the worker path in `index.html`.

## Controls

| Control | What it does |
| --- | --- |
| **Start watching / Pause match** | Starts or pauses the automated game. A click before the engine is ready is queued. |
| **New game** | Resets the board. If a match is running it immediately starts over from the initial position. |
| **Thinking depth** | 4–18 ply of search per move. Higher is stronger, slower, and hungrier for battery. |
| **Move pacing** | Delay between moves: Instant, Quick, Relaxed (default), Slow. |
| **Opening variety** | How much the engines are allowed to deviate in the opening — see below. |
| **↻ Flip board** | Turns the board around. |
| **⧉ PGN** | Copies the game so far as PGN to the clipboard; if the clipboard is blocked it downloads a `.pgn` file instead. |

### Why "Opening variety" exists

A fixed-depth search is deterministic. Given the same position and the same depth, Stockfish always answers with the same move — so without variety, every single game would replay exactly the same moves forever, and **New game** would be pointless.

With variety on, the page asks the engine for several root moves at once (`setoption name MultiPV`) during the opening and picks at random between the moves it rates as nearly equal:

- **Fixed line** — always the engine's top move. Every game is identical (useful for comparing depth or pacing).
- **Varied** *(default)* — top 4 moves within 0.40 pawns of each other, for the first 10 plies.
- **Very varied** — top 5 moves within 0.90 pawns, for the first 16 plies.

Two guards keep the randomised openings looking like real chess:

- the tolerance shrinks with depth (a 4-ply search is noisy, so candidates must agree more closely there than at 12 ply);
- candidates are filtered for basic opening hygiene — no early queen sorties, no rook-pawn pushes, no knights to the rim, no `f3`/`f6` — and only if *every* near-equal move fails that filter does the raw list get used, so variety is never lost.

After the opening window the engines play their best move again (and `MultiPV` drops back to 1), so the games stay sound — only the opening changes.

Depth, pacing, and variety choices are remembered in `localStorage` between visits. Invalid or stale saved values are ignored.

The evaluation bar always shows the engine's assessment of the position (its top move), never one of the alternative opening candidates.

## Publish with GitHub Pages

1. Commit the three files to your repository's default branch.
2. Open **Settings → Pages** and publish from the default branch, using `/(root)`.
3. Open the Pages URL. The engine may take a few seconds to initialize on first load.

Pages serves `.wasm` as `application/wasm`, which the engine needs for streaming compilation. If you host it yourself, make sure your server sends that content type for `.wasm` or the engine will fail to start.

## Local testing

Serve the folder over HTTP (for example, `python3 -m http.server 8000`) rather than opening `index.html` directly. The browser must be able to load the matching WASM file beside the worker, and a `file://` page blocks the worker entirely — the app says so instead of failing silently.

### What has been verified

The app was exercised headlessly (jsdom driving the real page script, backed by the real Stockfish build) for:

- engine startup (`uci` → `uciok` → `isready` → `readyok`) and the ready/pending-start queue
- full games to completion: a 194-ply game ending in checkmate (including a rook underpromotion) and a 149-ply repetition draw, each with a valid PGN and correct `Result`
- variety on: every game distinct across depths 4/8/10 and both variety levels; variety off: identical games (determinism preserved)
- opening hygiene: no early queen sorties, rook-pawn pushes or rim knights in 18 sampled openings
- pause, resume, new game, flip board, depth change
- evaluation bar correctness while `MultiPV` is active
- PGN export leaves the live game state untouched, and resumes correctly afterwards
- game-over labels: checkmate, stalemate, insufficient material, fifty-move rule, repetition
- preference save/restore, including rejecting invalid saved values

## Open-source credits

- Stockfish.js 19.0.1 — GPL-3.0. License text and source links are included in the page.
- chess.js 1.4.0 — MIT. License text and source link are included in the page.
