# Ops prerequisites — before the funnel goes live

The `/api/audit/signup` form will accept leads as soon as the site is
deployed. **Do not promote the URL anywhere until every checkbox in
this file is green.** Booking an audit you can't deliver is worse than
not having the page up at all.

## Hard blockers (must be done before first cold outreach)

- [ ] **FAA Part 107 license** for the pilot in command.
      Knowledge-test scheduling: faa.gov/uas/commercial_operators.
      Cost ~$175, valid 24 months. Study time ~10–15 hours.
- [ ] **PCA partner signed.** See `docs/outreach/pca-recruiting.md`.
      LOI target: 2026-06-05. Executed agreement: 2026-06-19.
      No PCA → no funnel.
- [ ] **Drone hardware.** Recommended starter:
      - DJI Mavic 3 Multispectral (Mavic 3M) — RGB + 4-band multispec, ~$5K. Best fit.
      - DJI Mavic 3 (RGB only) — ~$2K. ExG works on RGB; multispec is upgrade.
      - DJI Air 2S — $1K, smallest viable, only for tiny test blocks.
      Choose based on capital. Mavic 3 (RGB) is fine for the first 5 pilots.
- [ ] **Insurance.**
      - Drone hull insurance (~$500–$1500/year for a Mavic).
      - General commercial liability (~$1M coverage, ~$600/year).
      - E&O / professional liability for the software output (~$1500/year).
      Carriers that cover ag drone work: Skywatch, Verifly, BWI Aviation.

## Soft blockers (must be done before first paid flight)

- [ ] **Real-data pipeline test.** Fly one block you control (a friend's
      vineyard, a community garden, anywhere with row crops). Run the
      orthomosaic through `src/droneToSpray/` and confirm the output makes
      sense. Today's pipeline has only been tested on synthetic ortho.
- [ ] **Orthomosaic stitching workflow.** DJI raw images → ortho. Options:
      WebODM (free, self-hosted), DroneDeploy ($150/mo), Pix4D ($350/mo).
      WebODM is the right call for cost; budget half a day for setup.
- [ ] **Field-boundary import.** Growers will give you a KML, GeoJSON, or
      a hand-drawn map. Validate the intake module handles all three; it
      currently assumes a clean polygon.
- [ ] **Grower data agreement** (one-pager). Who owns the imagery, who
      owns the prescription, what we can and can't share. Run by a
      California ag attorney once before first use.
- [ ] **PDF report customization.** Add the PCA's name + license number
      + signature line to the generated PDF. Today's PDF lacks the
      legal signature block.

## Operational readiness (must be done before scaling past 3 audits)

- [ ] **CRM-lite.** `data/audit-signups.jsonl` works for 1–10 leads.
      Beyond that, move to Airtable or a simple Postgres table with a
      kanban view (new → outreach → booked → flown → pilot).
- [ ] **Email notifications.** Today, you have to `tail` the jsonl file
      to see new leads. Wire SMTP / Resend / a webhook so each signup
      pings your inbox.
- [ ] **Flight scheduling.** Calendar link (Cal.com, Calendly) for the
      "let's schedule the flight" step. Avoid back-and-forth email.
- [ ] **Invoicing.** Stripe Invoicing for paid pilots. Don't build a
      full billing system — manual invoices until 10+ paying customers.
- [ ] **Backup pilot.** If you get sick or double-booked, who flies?
      At least one Tier 4 drone pilot from `icp.md` should be on standby
      with NDAs signed.

## Compliance / legal

- [ ] **California Business Entity** (LLC or C-corp) registered.
      Required for liability protection and to sign PCA agreements.
- [ ] **Seller's permit** (California Board of Equalization) if charging
      for services. The audit is free but the post-audit pricing kicks in.
- [ ] **Privacy + terms page.** Even a minimal pair. Link from the
      footer of `public/index.html`. We collect grower names, emails,
      and imagery — we need a privacy statement.
- [ ] **FAA airspace check workflow.** Some vineyards sit under
      controlled airspace (LAANC). Standard ops check before every flight.

## Tracking

This file is the source of truth. Update checkboxes as items complete.
When all hard blockers + soft blockers are done, edit the footer of
`public/index.html` to remove the "pilot program now booking" hedge
and update the topnav CTA from "Book a free audit" to whatever the
post-pilot wedge becomes.

Last reviewed: 2026-05-22.
