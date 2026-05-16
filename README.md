# DrCrop

DrCrop is a hackathon MVP for low-pesticide agriculture: an AI agronomist console that remembers pest observations, links related field events, and turns that memory into a targeted scout and treatment plan.

The demo story is the Sonoma strawberry grower problem: if aphids appear in one block and leaf curling appears nearby later, the farmer should not have to blanket-spray 80 acres just to feel confident. DrCrop keeps structured memory of crop, pest, location, severity, timing, and symptoms, then recommends where to scout first and when to escalate.

## What Works

- Live scout report intake for fields, zones, symptoms, severity, affected acres, and wind direction.
- Risk engine that connects related observations by pest/symptom similarity, crop, distance, timing, severity, and wind-aligned spread.
- Targeted plan showing confidence, biological-first recommendations, chemical escalation guardrails, and acres potentially spared from blanket spray.
- Knowledge graph view of fields, issues, observations, and related outbreak edges.
- GBrain write path through the installed `gbrain` CLI: new reports are written as markdown memory pages and linked with typed edges.
- ZeroEntropy context retrieval seam: with `ZEROENTROPY_API_KEY`, DrCrop reranks outbreak memory through `zerank-2`; without a key it stays demoable with local graph scoring.
- Claude-powered agronomist briefing: with `ANTHROPIC_API_KEY`, DrCrop turns the deterministic plan into a farmer-ready phone briefing; without a key it uses a deterministic fallback.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

Optional environment:

```bash
export ZEROENTROPY_API_KEY=...
export ANTHROPIC_API_KEY=...
export DRCROP_AGRONOMIST_MODEL=claude-sonnet-4-6
export DRCROP_GBRAIN=0 # disable GBrain writes if the local brain is not ready
```

Quick verification:

```bash
curl http://localhost:3000/api/health
```

Reset the live demo back to the seed Sonoma scenario:

```bash
curl -X POST http://localhost:3000/api/demo/reset
```

## Test

```bash
npm test
```

## Stack

- GStack was used as the build workflow and agent operating layer.
- GBrain is the structured memory layer. DrCrop calls `gbrain put` and `gbrain link` to persist observations and graph relationships.
- ZeroEntropy is the context retrieval layer requested in the hackathon instructions. DrCrop uses the official rerank endpoint shape with `zerank-2` when an API key is configured.
- Claude is the optional explanation layer. The agronomist endpoint is grounded in the deterministic DrCrop plan and linked memory, then falls back locally when no API key is present.

Sources:

- GBrain: https://github.com/garrytan/gbrain
- GStack: https://github.com/garrytan/gstack
- ZeroEntropy docs: https://docs.zeroentropy.dev/
- ZeroEntropy rerank API: https://docs.zeroentropy.dev/api-reference/models/rerank
