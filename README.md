# S H E R L O C K

**S H E R L O C K** — mesa de investigação visual sobre **Lughnasadh 0.2**.

Visual chess investigation desk. Not a cute chess app. Not Stockfish. Not a live-cheating aid.

Prep / analysis of positions only.

---

## Architecture

```
GUI (React)
   ↓ WebSocket
Sherlock Controller
   ↓ classical UCI only
Lughnasadh Adapter
   ↓ child process
Lughnasadh v0.2 binary
```

- The GUI **never** speaks raw UCI.
- The adapter owns: start, `uci`/`isready`, commands, parse `info`/`bestmove`, cancel, time limits, **session tokens** (stale replies discarded).
- Board FEN **survives** engine timeout / crash / restart.

```
┌────────────┐   WS    ┌──────────────────┐   UCI   ┌─────────────────┐
│  Browser   │◄───────►│ SherlockController│◄───────►│ LughnasadhAdapter│──► lughnasadh
│  React UI  │         │  + Express/WS     │         │  sessionId gate  │
└────────────┘         └──────────────────┘         └─────────────────┘
```

---

## Engine binary

| Source | Path |
|--------|------|
| Default symlink | `engines/lughnasadh` → `/workspace/lughnasadh-build/build/lughnasadh` |
| Absolute fallback | `/workspace/lughnasadh-build/build/lughnasadh` |
| Override | `LUGHNASADH_PATH=/path/to/binary` |

Classical UCI only: `uci`, `isready`, `ucinewgame`, `position fen|startpos moves`, `go depth N`, `go movetime MS`, `stop`, `quit`.

---

## Run (EN)

```bash
cd /workspace/sherlock   # or your clone
npm install
npm run build
npm start
# → http://127.0.0.1:8787
```

Dev (API on 8787 + Vite on 5173):

```bash
npm run dev
```

Smoke (real binary):

```bash
npm run smoke
```

Mock UCI parser tests (no binary):

```bash
npx tsx --test tests/uci-parsers.test.ts
```

---

## Executar (PT)

```bash
npm install && npm run build && npm start
```

Abra `http://127.0.0.1:8787`. Conecta ao Lughnasadh 0.2 no boot (`onEngineReady`). Use **ANALYZE** / **STOP**, carregue FEN, veja depth/nodes/nps/eval/PV e a conclusão **BEST MOVE**.

---

## MVP

1. Tabuleiro responsivo (chess.js + chessground)
2. Load FEN + NEW POSITION (startpos) + COPY FEN
3. Connect on boot → `onEngineReady`
4. ANALYZE (`go depth 12` ou `go movetime 2000`)
5. Live `onEngineInfo` → depth, nodes, nps, time, eval bar, PV
6. `onBestMove` → conclusion + highlight
7. STOP
8. Diagnostic log (UCI trail)
9. States: READY / INVESTIGATING… / BEST MOVE / ENGINE ERROR (+ Retry/Restart)
10. SessionId drops stale replies; position preserved across restart

---



---

## CASO CRUZADO — Lughnasadh × Lughnasadh (JOGAR)

Engine match mode: **two** independent Lughnasadh 0.2 processes (White + Black), classical UCI only.

- Threads option max is **1** → dual process instead of multi-thread.
- Default full power: **Hash 512MB per engine** (UCI max 4096), `go movetime 4000` (or depth 18+).
- Continuous until mate/draw or STOP. Live PGN stream. No Stockfish. No artificial strength cap.
- UI warns about battery/RAM; intentional for Galaxy S21 stress.

Desktop smoke:

```bash
npm run smoke:match
```

Android: dual `ProcessBuilder` slots (`main` / `white` / `black`) via `SherlockUci`.


## Honesty

- Engine: **Lughnasadh 0.2** (classical), never Stockfish, never DroidFish.
- Product name exclusively **S H E R L O C K**.
- No simulated engine replies in the integrated app (mocks only in unit tests).


---

## Android (Galaxy S21)

On-device build (WebView GUI + native Lughnasadh 0.2 via ProcessBuilder):

```bash
npm run android:s21
# → Sherlock-0.1.3-s21.apk
```

See `README-ANDROID-S21.txt` (PT) for sideload steps. Architecture on phone:

```
GUI (React in WebView)
  → LocalController
  → LocalLughnasadhAdapter
  → SherlockUci JavascriptInterface
  → ProcessBuilder(liblughnasadh.so)
```

No desktop Node/WebSocket dependency in the APK.


---

## Art direction (0.1.3 — LOCKED)

**SHERLOCK by LughLammas — chess as a case file.**

Lamp-black field, bone laid-paper dossiers, oxblood letterpress, antique gold hairlines.
Herald seal (`public/art/herald-seal.png`) as printed plate for icon / splash / header only — do not restyle.
Type: Playfair Display / Libre Baskerville + typewriter mono for FEN/PGN/log.
See `art-direction/README.md`.

Gaps: Chessground flat Staunton SVG pieces (not 3D); paint-bucket contrast marks are CSS chrome only; no physical desk props.
