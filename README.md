# DrCrop

**Crop Doctor Memory: the shared intelligence layer for low-pesticide agriculture.**

Live demo: https://drcrop-demo.fly.dev/

---

## The pitch

A month ago, I spoke with a strawberry grower in Sonoma County managing about 80 acres. He told me something simple and painful: when pests show up in one block, he often sprays far beyond the affected area because he does not have real-time confidence about how the outbreak is spreading.

That means higher chemical costs, more pesticide residue risk for the people eating those crops, and a harder path toward regenerative, biological-first farming.

Then I saw Garry Tan's request for startups in AI for low-pesticide agriculture, and the problem clicked: farmers do not just need another detector. They need memory.

So I built Crop Doctor Memory.

It is an AI agronomist powered by a knowledge graph. When Field Alpha reports aphids, DrCrop remembers the crop, pest, location, severity, timing, and field conditions. Later, when Field Beta reports leaf curling nearby, the agent connects the dots: this may be the same outbreak moving through the farm. Scout this zone first, try a biological intervention, and only escalate to chemical treatment if the threshold is crossed.

Instead of blanket-spraying 80 acres, the farmer gets a targeted action plan.

The goal is simple: help farmers grow more food while cutting unnecessary pesticide use by up to 90%.

Crop Doctor Memory is the shared intelligence layer for low-pesticide agriculture.

---

## How data enters

DrCrop is source-agnostic. A scout report can come from a human scout today, and from drones, phone photos, or field cameras tomorrow. What matters is turning raw field evidence into a structured observation: crop, pest, location, severity, time, and symptoms. Once that observation exists, the agent writes it into memory, compares it against prior outbreaks, and recommends where to scout first, when a biological intervention makes sense, and when to escalate.

---

## What works

- Live scout report intake for fields, zones, symptoms, severity, affected acres, and wind direction.
- Deterministic risk engine that connects related observations by pest/symptom similarity, crop, distance, timing, severity, and wind-aligned spread.
- Targeted plan showing confidence, biological-first recommendations, chemical escalation guardrails, and acres potentially spared from blanket spray.
- Knowledge graph view of fields, issues, observations, and related outbreak edges.
- **GBrain memory writes** through the installed `gbrain` CLI: every observation is persisted as a markdown memory page with typed links to its field, crop, issue, and related prior observations. Writes happen in the background so the UI stays snappy.
- **Hosted Fly demo** ships with a pre-initialized local PGLite GBrain so the live path is active without separate infrastructure.
- **ZeroEntropy context retrieval**: with `ZEROENTROPY_API_KEY`, DrCrop reranks outbreak memory through `zerank-2`; without a key it stays demoable with local graph scoring.
- **Claude-powered agronomist briefing** (Sonnet 4.6): with `ANTHROPIC_API_KEY`, DrCrop turns the deterministic plan into a farmer-ready phone briefing grounded in the linked memory; without a key it uses a deterministic fallback.

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

- **GStack** was used as the build workflow and agent operating layer.
- **GBrain** is the structured memory layer. DrCrop calls `gbrain put` and `gbrain link` to persist observations and graph relationships.
- **ZeroEntropy** is the context retrieval layer. DrCrop uses the official rerank endpoint shape with `zerank-2` when an API key is configured.
- **Claude Sonnet 4.6** is the explanation layer. The agronomist endpoint is grounded in the deterministic DrCrop plan and linked memory, then falls back locally when no API key is present.

Sources:

- GBrain: https://github.com/garrytan/gbrain
- GStack: https://github.com/garrytan/gstack
- ZeroEntropy docs: https://docs.zeroentropy.dev/
- ZeroEntropy rerank API: https://docs.zeroentropy.dev/api-reference/models/rerank

## License

MIT License. See [LICENSE](LICENSE).

## Built for

GStack × GBrain Hackathon, San Francisco — May 16, 2026.
