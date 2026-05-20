# DrCrop Agent Notes

Now two layers in one repo:

- **Drone-to-Spray** (`src/droneToSpray/`) — the current product direction. Drone ortho → ExG → row-aware mask → red/yellow/green zones → PDF/KML/GeoJSON. Synthetic-only today; real ortho intake next.
- **Crop Doctor Memory** (`src/riskEngine.js`, `src/agronomistAgent.js`, `src/gbrainAdapter.js`, `src/zeroEntropyAdapter.js`) — hackathon scout console kept as the verification + briefing layer.

Zero-dependency stance still holds for the drone module: PNG/PDF/KML/GeoJSON are all hand-rolled on Node's `zlib`. Add a dep only if it clearly buys speed without breaking the demo.

## Commands

```bash
npm run dev
npm test
```

## Architecture

- `server.js`: HTTP server, static UI, JSON API. `/api/drone/*` routes live in `handleDroneApi`.
- `src/droneToSpray/`: drone-to-prescription pipeline.
  - `syntheticOrtho.js` — deterministic vineyard ortho + ground-truth grid.
  - `vegetationIndex.js` — ExG = 2g − r − b.
  - `rowMask.js` — inter-row vs canopy classification.
  - `zones.js` — bucket into spray/scout/skip with acres + $ saved.
  - `overlay.js` — paint zone tints onto pixel buffer.
  - `png.js` — pure-JS RGB PNG encoder.
  - `exportPdf.js` — hand-rolled PDF 1.4.
  - `exportKml.js`, `exportGeoJson.js` — vector exports.
  - `pipeline.js` — orchestrator + before/after diff.
  - `flightStore.js` — in-memory flight cache (max 8).
  - `index.js` — public surface used by server.js.
- `src/riskEngine.js`: deterministic outbreak relationship scoring and treatment plan generation.
- `src/gbrainAdapter.js`: best-effort GBrain CLI writes and typed links.
- `src/zeroEntropyAdapter.js`: optional ZeroEntropy reranking via `ZEROENTROPY_API_KEY`.
- `public/`: grower-facing console + drone-to-spray panel (`#drone` section).
- `data/`: seed farm and observations for the memory layer.

## Drone-to-Spray endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/drone/demo/synthetic` | Generate + process a synthetic Sonoma vineyard flight. |
| `GET /api/drone/flights` | List in-memory flights. |
| `GET /api/drone/flight/:id` | Public view (summary + zones + transform + export URLs). |
| `GET /api/drone/flight/:id/ortho.png` | Raw orthomosaic PNG. |
| `GET /api/drone/flight/:id/overlay.png` | Ortho + zone tint overlay. |
| `GET /api/drone/flight/:id/export/pdf` | One-page grower PDF. |
| `GET /api/drone/flight/:id/export/kml` | KML for Google Earth / drone pilot apps. |
| `GET /api/drone/flight/:id/export/geojson` | GeoJSON FeatureCollection. |
| `POST /api/drone/verify` | `{ beforeId, afterId }` → before/after diff. |

## Product Bar

The drone-to-spray panel is the new top-of-funnel: a grower or PCA should be able to press one button and see the artifact (overlay + acres + $ saved + downloads). The scout console below it remains the usable grower workflow for outbreak memory. Neither screen is a marketing landing page.

## GBrain Search Guidance (configured by /sync-gbrain)
<!-- gstack-gbrain-search-guidance:start -->

GBrain is set up and synced on this machine. The agent should prefer gbrain
over Grep when the question is semantic or when you don't know the exact
identifier yet.

**This worktree is pinned to a worktree-scoped code source** via the
`.gbrain-source` file in the repo root (kubectl-style context). Any
`gbrain code-def`, `code-refs`, `code-callers`, `code-callees`, or `query`
call from anywhere under this worktree routes to that source by default —
no `--source` flag needed.

Two indexed corpora available via the `gbrain` CLI:
- This worktree's code (auto-pinned via `.gbrain-source`).
- `~/.gstack/` curated memory (registered as the `default` source today;
  will migrate to `gstack-brain-<user>` when the federation pipeline runs).

Prefer gbrain when:
- "Where is X handled?" / semantic intent, no exact string yet:
    `gbrain search "<terms>"` or `gbrain query "<question>"`
- "Where is symbol Y defined?" / symbol-based code questions:
    `gbrain code-def <symbol>` or `gbrain code-refs <symbol>`
- "What calls Y?" / "What does Y depend on?":
    `gbrain code-callers <symbol>` / `gbrain code-callees <symbol>`
- "What did we decide last time?" / past plans, retros, learnings:
    `gbrain search "<terms>" --source default`

Grep is still right for known exact strings, regex, multiline patterns, and
file globs. Run `/sync-gbrain` after meaningful code changes; for ongoing
auto-sync run `gbrain autopilot --install` once per machine.

**Note:** semantic `search`/`query` and the agronomist briefing endpoint
both need `ZEROENTROPY_API_KEY` exported in the shell to populate
embeddings (symbol-aware `code-def`/`code-refs` work without it).

<!-- gstack-gbrain-search-guidance:end -->
