# DrCrop

> **DrCrop turns drone images into pesticide saving spray/no-spray maps, helping growers treat only the acres that need it and prove yield was not hurt.**

Closed loop: see with drones → decide with AI + a licensed PCA → act through existing sprayers → verify with before/after flights.

- Live site: https://drcrop-demo.fly.dev/
- Pipeline demo: https://drcrop-demo.fly.dev/demo

---

## Pilot program — NorCal vineyards, 2026 season

DrCrop is booking 5 free spray-waste audits for Northern California
vineyards (Napa, Sonoma, Mendocino, Lake, Marin, Solano). One block,
PCA-reviewed prescription map, verification re-fly. No savings, no charge.

The pilot landing page is `public/index.html` (served at `/`). It accepts
audit requests at `POST /api/audit/signup`; leads append to
`data/audit-signups.jsonl` (gitignored). See `docs/outreach/` for the
outbound side and `docs/ops-prereqs.md` for what must be true before the
funnel is promoted publicly.

---

## Drone-to-Spray pipeline

One drone flight tells a grower where to spray, scout, and skip. First
wedge: under-vine weed pressure on NorCal vineyards.

Try the pipeline without a real flight — `/demo` runs it on a synthetic
Sonoma vineyard ortho and produces every export. Or hit the API directly:

```bash
curl -X POST http://localhost:3000/api/drone/demo/synthetic | jq .flight.id
# → flight-<hex>; then GET /api/drone/flight/<id>/{ortho.png,overlay.png,export/pdf,export/kml,export/geojson}
```

**Stages (`src/droneToSpray/`)**

1. **Intake** — RGB orthomosaic (synthetic today; DJI/DroneDeploy/WebODM ingest next) + field boundary + row geometry.
2. **ExG vegetation index** — `2g − r − b` per pixel, threshold to a green-mask.
3. **Row-aware masking** — separates under-vine canopy strips from inter-row strips so weeds get scored *between* vines, not under them.
4. **Zoning** — buckets each management cell into red (spray), yellow (scout), or green (skip) with acres and estimated dollars/oz saved.
5. **Export** — PDF for the grower (overlay map + per-zone summary), GeoJSON + KML for the PCA, applicator, or drone pilot.
6. **Verify** — `POST /api/drone/verify { beforeId, afterId }` diffs two flights to report acres spared and zones improved.

All raster, PDF, KML, and GeoJSON work is pure-JS (Node `zlib` + a hand-rolled PDF builder). No new npm dependencies.

---

## Demo console (`/demo`)

The original scout console — Sonoma County demo data, GBrain typed-link
memory, ZeroEntropy rerank, Claude Sonnet briefings — lives at `/demo`.
It is the live walkthrough we run for growers and PCAs to show how the
pipeline produces an artifact, and the verification + briefing layer
that wraps prescription history.

---

## Run

```bash
npm run dev
```

Open `http://localhost:3000` for the grower funnel, or
`http://localhost:3000/demo` for the demo console.

Optional environment:

```bash
export ZEROENTROPY_API_KEY=...
export ANTHROPIC_API_KEY=...
export DRCROP_AGRONOMIST_MODEL=claude-sonnet-4-6
export DRCROP_GBRAIN=0   # disable GBrain writes if the local brain is not ready
```

Quick verification:

```bash
curl http://localhost:3000/api/health
```

Reset the demo back to the seed Sonoma scenario:

```bash
curl -X POST http://localhost:3000/api/demo/reset
```

## Test

```bash
npm test
```

## Stack

- **GStack** as the build workflow and agent operating layer.
- **GBrain** as the structured memory layer. DrCrop calls `gbrain put` and `gbrain link` to persist observations and graph relationships.
- **ZeroEntropy** as the context retrieval layer. DrCrop uses the rerank endpoint with `zerank-2` when an API key is configured.
- **Claude Sonnet 4.6** as the explanation layer. The agronomist briefing is grounded in the deterministic DrCrop plan and linked memory, with a deterministic local fallback when no API key is present.

Sources:

- GBrain: https://github.com/garrytan/gbrain
- GStack: https://github.com/garrytan/gstack
- ZeroEntropy docs: https://docs.zeroentropy.dev/
- ZeroEntropy rerank API: https://docs.zeroentropy.dev/api-reference/models/rerank

## License

MIT License. See [LICENSE](LICENSE).
