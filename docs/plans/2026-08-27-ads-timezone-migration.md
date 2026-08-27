# Ads analytics timezone migration (UTC → viewer / ad-account timezone)

Status: **planned (separate project)** — not part of the ads dashboard filter-reuse work.
Owner: TBD · Created: 2026-08-27

## Problem

The Ads analytics dashboard reports entirely in **UTC**, end to end:

- `parseAnalyticsDateRange` (`apps/builder/src/features/ads/schemas/analytics.ts`)
  anchors the `from`/`to` date-keys to UTC day boundaries
  (`${from}T00:00:00.000Z` … `${to}T23:59:59.999Z`).
- The ads-conversion repository buckets the timeseries day with hardcoded UTC:
  `to_char(occurredAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
  (`packages/database/src/repositories/ads-conversion-event/repository.ts:995`,
  and the CTWA/first-interaction variants at ~731, ~824, ~901).
- The CSV export filename + rows are documented as **byte-identical for external
  consumers** (`apps/builder/src/app/space/[workspaceId]/dashboard/ads/export/route.ts`).
- The repository already flags the deeper issue in a comment (~lines 811–814):
  conversions near midnight should bucket by the **ad account's reporting
  timezone**, called out as a follow-up.

The shared `DateRangePresetFilter` (reused by the Ads dashboard for UI
consistency with Contacts/Conversations) computes presets in the viewer's
**local** timezone. That local-day selection is currently written to the URL as
local date-keys and then read by the UTC pipeline — an **interim seam** that
shifts a non-UTC viewer's window by their UTC offset. See the note in
`apps/builder/src/features/ads/lib/ads-date-key.ts`.

## Goal

A viewer sees each calendar day's ads metrics for the intended timezone, with the
window, the day-bucketing, and the CSV export all consistent — no offset shift,
no partial end-buckets.

## Key decision: which timezone is authoritative?

Two candidates, and they are not the same:

1. **Viewer browser timezone** — matches Contacts/Conversations (which thread a
   `timezone` through their queries) and matches the local-oriented shared
   filter. Best for in-product "what happened today for me".
2. **Ad account reporting timezone** — matches how Meta reports spend/insights;
   required for spend and CTWA conversion numbers to reconcile with Meta's own
   dashboards. The repository comment points here.

These can disagree (a viewer in UTC+7 looking at a US ad account). The migration
must pick one authority per metric, or reconcile them explicitly:
- CTWA funnel conversions (our DB) → viewer timezone is defensible.
- Spend / daily insights (Meta) → ad-account timezone is effectively forced.
Mixing them per-day is the root of the "near midnight" discrepancy the code
comment describes. **This choice is the crux of the project and must be settled
first**, ideally with product + whoever owns the external CSV contract.

## Scope / steps (once the authority is decided)

1. Thread the chosen timezone from the request to the query layer.
   - If viewer TZ: pass it from the client (URL param or a request header the
     middleware forwards) — a server component cannot read the browser TZ.
   - If ad-account TZ: resolve it from the connected ad account when scoping.
2. `parseAnalyticsDateRange`: build `since`/`until` at day boundaries in the
   chosen timezone (date-fns-tz `fromZonedTime`), keeping the existing 366-day
   cap + clamp logic on the resulting instants.
3. Repository day-bucketing: replace the hardcoded `AT TIME ZONE 'UTC'` in every
   `to_char(... 'YYYY-MM-DD')` expression with the chosen timezone. Verify the
   partition/index plan still holds (the 2020 TimescaleDB floor, hypertable
   partitions).
4. `enumerateDateKeys` + timeseries merge: enumerate the day axis in the chosen
   timezone so funnel (DB) and daily insights (Meta) align on the same day-keys.
5. Export CSV: decide whether the reporting-contract change is acceptable to
   external consumers; version or gate it if not. Update the filename date label
   to the chosen timezone.
6. Filter: drop the interim local-key seam — the filter's local selection now
   matches the pipeline (viewer-TZ case), or convert selections to the
   ad-account TZ (ad-account case).

## Risks

- **External CSV consumers** depend on the current byte-identical UTC output —
  changing day boundaries changes which rows land in which day.
- **Metric reconciliation** with Meta's own reporting (ad-account TZ) vs.
  in-product "my day" (viewer TZ) — picking wrong makes numbers "not match".
- **DST** — day length varies; use a real TZ library (date-fns-tz), never a
  fixed offset.
- **Query performance** — `AT TIME ZONE` on a large scan; confirm index usage.

## Test plan

- Unit: `parseAnalyticsDateRange` day boundaries across DST transitions and a
  negative + positive offset zone.
- Repository: bucketing places a boundary event (23:30 and 00:30 local) in the
  expected day for the chosen timezone.
- Timeseries: funnel + spend day-keys align; no partial first/last bucket.
- Export: golden-file diff of the CSV under the chosen timezone; explicit
  sign-off on any external-contract change.
- Cross-check a known ad account against Meta Ads Manager for the same window.

## Interim behavior (this task)

The Ads dashboard keeps the shared filter with local-day selection over the
still-UTC pipeline (documented seam). The Lifetime-clamp and redirect-channel
fixes shipped alongside are independent of this migration.
