# Recurring broadcasts

A broadcast that repeats on a schedule — every N days, weeks or months — for any channel. The repeat rule, the
due scan and the run materialization are channel-agnostic; each run is an ordinary broadcast and flows through the
existing prepare → send → reconcile → finalize pipeline unchanged.

## Model

```
template Broadcast   schedulesType = recurring, occurrenceAt NULL
                     status: draft → recurring → cancelled (paused) | sent (ended)
  1—1  BroadcastRecurrence            the rule + the cursor
  1—n  BroadcastRecurrenceOccurrence  the ledger: one row per logical slot
  1—n  child Broadcast                parentBroadcastId → template, occurrenceAt NOT NULL
```

- `isRecurringTemplate(row)` / `isRecurrenceRun(row)` (`packages/database/src/partials/broadcast.ts`) are the single
  routing predicates. A template never sends; it only owns the schedule. Its `cancelled` and `sent` statuses read as
  **Paused** and **Ended** in the UI.
- `BroadcastRecurrence.nextRunAt` is the cursor: the series is **armed iff `nextRunAt` is not null**. The template's
  `schedulesAt` mirrors it, so lists and the calendar sort by it for free.
- A run is created with `schedulesType = future`, `schedulesAt = occurrenceAt`, status `scheduled`, so the existing
  `enqueueBroadcast` tick picks it up; a unique index on `(parentBroadcastId, occurrenceAt)` makes a duplicate
  impossible.

### The rule (`packages/utils/src/recurrence.ts`)

`frequency` (`daily | weekly | monthly`), `interval`, `weekdays` (0 = Sunday, weekly), `monthDay` (1–31 or `"last"`,
monthly), `timeOfDay` (`HH:mm`), `timezone` (IANA), `startsOn` (`YYYY-MM-DD` in that zone) and `end`
(`never | onDate | afterOccurrences`). The schema is shared by the public API, the server action and the form.

- Weeks are ISO weeks (Monday first); Sunday belongs to the preceding week.
- A monthly day 29–31 **clamps** to the last day of a shorter month.
- **DST**: a wall-clock time in a spring-forward gap moves forward by the real transition size; an ambiguous
  fall-back time takes the earlier instant. Pinned per zone in `packages/utils/__tests__/recurrence.test.ts`.
- A zone that skips a whole calendar day (`Pacific/Apia`, 2011-12-30) resolves the skipped day's slot to the next day's
  instant; one instant is one send, so the ledger records that instant once rather than two logical slots.
- A backfill enumerates at most 5 000 slots (about 13 years of a daily series); a pause longer than that is not a case
  the product supports.
- `afterOccurrences` counts runs made over the series' life (skipped slots never consume it).

## The accounting invariant

> Postgres is the authority; Redis is an optimization. Every slot the rule produces up to now is written to the ledger
> **in the same transaction** that advances the series.

Each ledger row records `outcome`:

| outcome | meaning |
|---|---|
| `created` | a run exists (`childBroadcastId`); delivery state is read from the run |
| `skipped` | deliberately not sent — `paused`, `draft` (being edited), `blockedOwner`, `planLimit`, `noTargets`, `undeliverable` |
| `missed` | lost to an outage; a later slot was sent instead (`catchUpSuperseded`) |

So "yesterday failed, send today, skip yesterday" is data, not a gap: the runs view shows yesterday as *Not sent —
the platform was down* and its stats as not applicable. When a backlog exceeds 500 slots the oldest collapse into one
summary row (`supersededCount`).

### Catch-up

If the platform was down across several slots, `materializeOccurrence` sends **only the latest missed slot** (the
user's choice, matching v1's "send until the end of the day") and records every earlier slot as `missed`. Pausing or
editing accounts the slots in the gap as `skipped/paused` / `skipped/draft`; resuming never backfills.

## Flow

```
schedule queue     enqueueRecurringBroadcasts (cron, every minute, distributedLock 55 s, fails fast if held)
                   → keyset-pages the due series (index BroadcastRecurrence_due_idx, DB clock `now()`)
                   → broadcastRecurrence queue, batches of 100 (job id broadcast-recurrence-<dueAtMs>-<page>-<chunk>)
broadcastRecurrence worker  (dedicated; BROADCAST_RECURRENCE_WORKER_CONCURRENCY, default 10)
                   → per item: blocked owner ? skipOccurrence : materializeOccurrence
                   → after commit: schedule queue prepareBroadcast (shared job id broadcastPrepareJobId)
```

`materializeOccurrence` is one transaction: lock the series row, re-check the cursor (stale → no-op), return the
existing decision if the slot is already in the ledger (a retried job after a lost commit-ack), account missed slots,
re-check deliverability, check plan capacity **before** inserting, insert the child + targets + ledger row, then
advance the cursor with a compare-and-set on `nextRunAt`.

### Lock order

One transaction always acquires **(a) `BroadcastRecurrence` rows ascending by id, then (b) `Broadcast` rows ascending
by id**, workspace-scoped. `create`/`clone` are exempt (the new parent is unpublished). Teardown
(`cancelInFlightBroadcastsForWorkspace`) takes (a) for the whole workspace first, accounts due slots, then cancels.

## Capacity

- The enqueue tick is ~20 index pages for 100 k due series; the worker materializes ≈ 6 short statements per series,
  10 in parallel per job, horizontally scalable. A dedicated queue (bulk Redis group) keeps the `schedule` worker's
  slots free for the other crons.
- Backpressure: a tick adds nothing while ≥ 2 000 batches are waiting or delayed — the cursor stays due, so nothing is
  lost by waiting.
- Prepare/send capacity for the *children* is the pre-existing bottleneck and is unchanged.

## Operations

- **Deploy order: migrate → worker → builder.** Old `schedule` workers log "Unknown schedule job type" for the new
  cron until replaced; no `recurring` rows exist before the builder ships. The three migrations are
  `…_add_broadcast_recurrence` (transactional), `…_add_broadcast_occurrence_unique_index` (`CONCURRENTLY`; if it is
  interrupted, drop the INVALID index and re-run) and `…_widen_broadcast_occurrence_slot_key` (transactional; recreates
  the ledger unique index on `(recurrenceId, localSlot, occurrenceAt)`).
- **Alert on `oldestDueAgeMs`** in the `enqueue-recurring-broadcasts` log: it grows when the recurrence worker or Redis
  is unhealthy.
- **Redis flush**: restart the workers so `registerSchedules` recreates the job schedulers (true of every cron). The
  database cursor loses nothing; slots are materialized late and the ledger shows the lateness.
- A run stuck in `scheduled` for 30 minutes past its slot is flagged **Stalled** in the runs view; the existing
  `enqueueBroadcast` tick keeps retrying it.
- Retrying a failed run is the existing `broadcasts.resend` on the child (an unlinked one-off).

## API (agent-first)

`broadcasts.create` / `draft update` / `schedule` take `schedulesType: "recurring"` + `recurrence`.
New: `broadcasts.previewRecurrence` (`POST /v1/broadcasts/preview-recurrence`), `broadcasts.listRunGroups`
(`GET /v1/broadcasts/{idOrName}/run-groups`, `groupBy` day | week | month) and `broadcasts.listOccurrences`
(`GET /v1/broadcasts/{idOrName}/occurrences`). `broadcasts.list` hides nothing by default; pass `includeRuns: false`
for the series only, `schedulesType: recurring` for series, or `parentBroadcastId` for one series' runs. `stop`
pauses a series, `resume` re-arms it (no catch-up), `moveToDraft` reopens it for editing.

## Deferred

The 100 k-series load test (`EXPLAIN (ANALYZE)` of `listDue` against `BroadcastRecurrence_due_idx`, enqueue wall time,
materialize throughput per worker) is not recorded yet; the capacity figures above are estimates until it is. The
calendar lists a live series at its next run but does not mark it with a repeat icon.

`retryOccurrence` for a missed/skipped slot, a ledger retention policy (~100 bytes/row; ≈ 36 M rows/year at 100 k daily
series), periodic self-repair of job schedulers after a Redis flush, and raising prepare/send capacity for 100 k child
broadcasts per minute.
