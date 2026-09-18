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

## Honesty

- Engine: **Lughnasadh 0.2** (classical), never Stockfish, never DroidFish.
- Product name exclusively **S H E R L O C K**.
- No simulated engine replies in the integrated app (mocks only in unit tests).


---

## Android (Galaxy S21)

On-device build (WebView GUI + native Lughnasadh 0.2 via ProcessBuilder):

```bash
npm run android:s21
# → Sherlock-0.1.0-s21.apk
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
