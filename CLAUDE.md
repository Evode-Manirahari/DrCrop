# DrCrop Agent Notes

This is a hackathon MVP. Preserve the zero-dependency Node app unless a dependency clearly buys speed without breaking the demo.

## Commands

```bash
npm run dev
npm test
```

## Architecture

- `server.js`: HTTP server, static UI, JSON API.
- `src/riskEngine.js`: deterministic outbreak relationship scoring and treatment plan generation.
- `src/gbrainAdapter.js`: best-effort GBrain CLI writes and typed links.
- `src/zeroEntropyAdapter.js`: optional ZeroEntropy reranking via `ZEROENTROPY_API_KEY`.
- `public/`: grower-facing console.
- `data/`: seed farm and observations.

## Product Bar

The first screen must remain the usable grower workflow: submit observation, inspect memory links, and get a targeted action plan. Avoid turning this into a marketing landing page.
