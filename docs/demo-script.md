# DrCrop Demo Script

1. Open the console and point to the existing aphid memory in Field Alpha.
   Optional reset before judges walk up: press `Reset`, or run `curl -X POST http://localhost:3000/api/demo/reset`.
2. Submit a new Field Beta report: `Leaf curling`, severity `4`, `1.6` acres, symptoms `curling leaves and honeydew on new growth`.
3. Show that DrCrop connects the new report to the earlier aphid outbreak through same crop, nearby block, same-day timing, compatible symptoms, and severity.
4. Read the auto-generated agronomist briefing, then point out it is grounded in the deterministic plan and linked memory.
5. Read the action plan: scout the linked zones first, use a biological intervention, and escalate only after threshold confirmation.
6. Show the acres avoided number: the system narrows action to the hot zone instead of assuming all 80 acres need treatment.
7. Open the graph/retrieval panel. If `ZEROENTROPY_API_KEY` is configured, run retrieval to show hosted context reranking. If not, show the local fallback and explain the API seam is ready.
8. In one sentence: DrCrop is shared outbreak memory for farms, built on GBrain, with retrieval-ready context for AI agronomists.

## Judge Pitch

Farmers do not just need pest detection. They need memory. DrCrop remembers every observation as structured field knowledge, connects weak signals across blocks, and turns that context into lower-pesticide action plans.

The wedge is strawberries and other high-value specialty crops where pesticide decisions are expensive, time-sensitive, and residue-sensitive. The same memory graph can later absorb trap counts, weather, drone imagery, lab results, and treatment outcomes.
