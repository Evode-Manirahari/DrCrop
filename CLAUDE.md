# DrCrop Agent Notes

Three layers in one repo:

- **Grower funnel** (`public/index.html` at `/`) — public marketing + lead-capture surface. Free-audit signup posts to `/api/audit/signup`; leads land in `data/audit-signups.jsonl` (gitignored). See `docs/outreach/` for outbound and `docs/ops-prereqs.md` for what must be true before the funnel is promoted publicly.
- **Drone-to-Spray** (`src/droneToSpray/`) — the product. Drone ortho → ExG → row-aware mask → red/yellow/green zones → PDF/KML/GeoJSON. Synthetic-only today; real ortho intake next.
- **Demo console** (`public/demo.html` at `/demo`) — hackathon-era scout console. Kept as the live demo growers and PCAs click through, and as the verification + briefing layer over the drone pipeline.

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
- `public/index.html`: grower funnel (hero, how-it-works, sample report, pricing, audit signup). Inline JS only.
- `public/demo.html`: demo console + drone-to-spray panel (`#drone` section). Served at `/demo`. Loads `/app.js`.
- `public/styles.css`: shared. Grower-funnel styles live in a clearly marked section at the bottom.
- `data/`: seed farm + observations for the memory layer. Lead capture appends to `data/audit-signups.jsonl` (gitignored).
- `docs/outreach/`: ICP target list, cold-email templates, PCA recruiting playbook. Sales motion, not code.
- `docs/ops-prereqs.md`: hard/soft blockers before the funnel goes live (Part 107, PCA partner, insurance, etc).

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

## Audit signup endpoint

`POST /api/audit/signup` validates + appends one lead per line to
`data/audit-signups.jsonl`. Required: `name`, `vineyard`, `county` (must
be in `AUDIT_COUNTIES`), `blockAcres` (rejected if outside 0.5–1000, not
clamped), `email`. UA captured from headers. The log line redacts email
to `first-char***@domain`. File is gitignored.

Email notification (opt-in) goes through `src/notifier.js` via Resend.
Set both `RESEND_API_KEY` and `DRCROP_LEAD_NOTIFY_EMAIL` to enable; the
notifier is fire-and-forget so a Resend outage cannot 500 the signup.
Optional `DRCROP_LEAD_NOTIFY_FROM` overrides the sender (default uses
`onboarding@resend.dev`, which works on Resend's free tier without DNS).

## Legal pages

`public/privacy.html` and `public/terms.html` are static and served at
`/privacy` and `/terms` via the extensionless-path resolver in
`safeStaticPath`. Both are written as honest plain-language pages —
edit them as the product changes, not as legal moves.

## Product Bar

`/` is the public marketing surface for growers — it must look like a
real company, not a demo. `/demo` is the working console used to *show*
how the pipeline produces an artifact. Keep the two surfaces separate;
do not let demo-grade affordances (status pills, reset-demo buttons,
hackathon credits in the hero) leak back to `/`.

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
