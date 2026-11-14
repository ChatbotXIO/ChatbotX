# Automatic Customer Scan

Creates ChatbotX contacts from a channel's existing conversation history — the
operator picks a connected inbox and a "scan from" time, and a background job
walks the channel's conversation list newest→oldest, stopping at that time, and
imports every participant who is not already a contact. Ported from v1's
"Quét Khách Hàng Tự Động". Messenger and Instagram (native and via Facebook) today.

Entry point: **Contacts → Import ▸ Automatic Customer Scan**.

## Where it lives

| Layer | Path |
|-------|------|
| Channel enum | `packages/utils/src/channel.ts` (`contactScanChannels`, `isContactScanChannel`) |
| Table + repository | **reuses `CoexistSyncRun`** — `packages/database/src/schema/coexist-sync-run.ts`, `.../repositories/coexist-sync-run/repository.ts` |
| Business | `packages/business/src/contact-scan/` (`contactScanService`, `resolveContactScanAvailability`, `contactScanIntegrationRefs`) |
| Queue / cron | `packages/worker-config` (`IntegrationJobAction.contactScan`, `ScheduleJobData.scanContactScans`) |
| Worker | `apps/worker/src/integration/handlers/contact-scan/` (engine, adapter registry) + `schedule/handlers/scan-contact-scans.ts` |
| Builder | `apps/builder/src/features/contact-scan/` + the Import sub-menu in `contacts/contacts-list-action.tsx` |

## Shared-table model (the key invariant)

A contact scan does **not** get its own table. It is a `CoexistSyncRun` row with
`type = 'contact_scan'`; a coexistence sync is `type = 'coexist'`. The two share
the run lifecycle (claim-with-token, stale-heartbeat takeover, `pickDueRuns`,
`markMaxAttemptsFailed`, chunk budget + continuation) and the `coexistRunStatus`
enum.

**Every existing coexist query that selects rows by anything other than the
primary key `id` MUST filter `type = 'coexist'`, and the scan's own set-queries
filter `type = 'contact_scan'`.** By-`id` methods are safe (the PK is unique
across types). The critical one is `findResumeCeiling`: without the `type`
filter a finished scan would become the next coexist history sync's ceiling and
silently skip newer messages. `packages/database/__tests__/coexist-sync-run-type-scoping.test.ts`
inserts a scan row and asserts every coexist set-query ignores it — a missed
filter fails CI. The scan claim (`claimContactScanRun`) is itself type-scoped,
so a misrouted job can never mutate a coexist row.

Columns added for the scan (NULL/default for coexist rows): `type`,
`scanFromAt` (walk ceiling), `requestedByUserId`, `resumeCursor` (continuation
cursor). Two new partial indexes scope the scan's "one active per integration"
uniqueness and the sweeper's due-scan; the existing `_integration_init_uq` was
narrowed with `AND type = 'coexist'`.

## State machine

Statuses reuse `coexistRunStatus`: `init` → `running` → `succeeded`|`partial`|`failed`
(`waiting` is WhatsApp-coexist-only, never used by a scan).

```
schedule()  ── insert type='contact_scan', status='init'  (partial unique index: one active per integration)
   │
scanContactScans cron (1 min, distributedLock)  ── pickDueRuns({ type:'contact_scan' }) ── enqueue contactScan job
   │
runContactScan engine ── claimContactScanRun (mints claimToken) ── walk /conversations DESC
   │   stop at scanFromAt (ceiling); skip above lastSyncedAt (frontier); bulkImportChannelContacts per page
   │   4-min chunk budget → yieldForContinuation (release token, stay 'running') → enqueue next chunk → reclaim
   ├── done          → succeeded | partial (page cap) | failed
   ├── cancelled     → partial + `cancelled` sentinel (operator Cancel, or channel disconnected)
   ├── rate limit / high usage → park (running, no claim) + delayed job; attempts untouched
   ├── transient err → retryOrFail: back to 'init' for the sweeper, or failed on the 5th in a row
   └── auth/permission err → failed (currentError sentinel)
```

- **Cancel**: `POST /v1/contact-scans/cancel` (`contactScans.cancel`) and the
  "Cancel scan" button end a live scan as `partial` with the `cancelled`
  sentinel, clear its claim and cursor, and keep the contacts already imported.
  The worker's next write is fenced out, so at most the page in flight finishes.
  It is shown as `cancelled` (one mapping, `resolveContactScanRunStatus`, used by
  the status view and the history list; no new enum value). Nothing running is
  `cancelled: false`, not an error. Disconnecting Messenger or Instagram cancels
  the integration's scan in the same transaction. A cancelled scan still counts
  toward the 24 h cooldown (measured from `createdAt`).
- **Cooldown**: 24 h from `createdAt` before the same inbox can scan again
  (`resolveContactScanAvailability`). ETA shown to the user is `createdAt + 4 h`
  (derived, not stored).
- **Stuck scan**: never re-opened by the UI; the sweeper re-picks a `running`
  scan whose heartbeat is > 1 h stale and terminalizes it after 5 attempts.
- **Quota**: no gate. Imported contacts bump the info-only `contacts` counter
  after each page (exactly like the CSV import); MAC is not reserved.
- **Permissions**: scheduling and reading status both require an unrestricted
  contacts scope (`requireUnrestrictedContactsScope`) — an assigned-only member
  is denied.

## Adding a channel

1. Add the value to `contactScanChannels` (`packages/utils/src/channel.ts`).
2. Add a `pgEnum` value migration only if a new *channel* enum value is needed
   (the scan reuses the existing `channelType`; usually nothing here).
3. Add the integration lookup entry to `contactScanIntegrationRefs`
   (`packages/business/src/contact-scan/channel-registry.ts`).
4. Add the adapter to `contactScanAdapters`
   (`apps/worker/src/integration/handlers/contact-scan/adapter.ts`) implementing
   `loadContext` / `listPage` / `classifyError` / `readBackoff` for the channel's conversation API (`classifyError` goes through the channel's own `mapToChannelError`).

The `satisfies Record<ContactScanChannel, …>` on the registry and the adapter map
makes a missing channel a compile error — no other file needs a channel branch.

## Pacing and rate limits

`apps/worker/.../contact-scan/pacing.ts` owns the rhythm (named constants, no
env switch: changing them is a code change and a deploy):

| | Value |
|---|---|
| Chunk | 5 pages or 4 minutes, whichever comes first |
| Between two pages | 1 second |
| Next chunk | queued 5 seconds later |
| Provider reports a wait | that wait, capped at 30 minutes |
| Rate limited, or usage ≥ 95% | 10 minutes |
| Usage ≥ 85% | 2 minutes |

Every wait is a **delayed job** (`yieldForContinuation` + `integrationQueue.add`
with `delay`), never a sleep in the worker, so a rate-limited scan holds no
worker slot. The scan path no longer uses `withInlineRetry` or
`sleepForUsageThrottle` (coexist keeps them).

- **Units**: Meta's `estimated_time_to_regain_access` is in **minutes**
  (Graph API "Rate Limits"). `estimatedMinutesToMs` in
  `integrations/messenger/src/apis/usage.ts` is the one place that converts it.
- **Neutral signal**: an adapter returns `{ usagePercent, retryAfterMs }` for a
  page and for a failed call (`readBackoff`, read from the error response's
  headers through `getOriginError`); the engine knows no header names or units.
- **Classification** goes through each channel's own `mapToChannelError`: a rate
  limit (`isRateLimited`: category `RATE_LIMITED` or reason `rate_limited`, or a
  bare HTTP 429) waits and retries the same page; network/5xx/timeouts are
  transient; `AUTH_FAILED` and `PERMISSION_DENIED` fail the scan. The code tables
  live in the integrations (`RATE_LIMIT_CODES`); a code with only the reason
  (Instagram `80002`; Instagram via Facebook `32`, `80001`, `80002`) makes the
  scan back off without changing how messages are sent.
- **Error accounting**: `attempts` is the sweeper's pick count, so a running
  claim is 1 and the Nth consecutive failure sees N. A finished page resets it
  to 1 (same write as the heartbeat); a rate limit leaves it alone; a
  transient failure goes through `retryOrFailContactScanRun`, one atomic UPDATE
  that returns the run to `init` or, on the 5th failure in a row, fails it at
  once (it cannot wait for `markMaxAttemptsFailed`).
- **Lost delayed job**: a parked run is `running` with no claim.
  `pickDueRuns({ releasedGraceMs })` (passed only by the scan, 35 minutes, longer
  than the 30-minute maximum wait) takes it back if its job is lost.
- A job that retries the SAME page after a rate limit carries a unique
  `generation` in its job id (`buildContactScanPageJobId`), because BullMQ drops
  an add whose id still exists.
- Separate work, not in this change: coexist's `usage-throttle.ts` and
  `messenger-sync.ts` also read the unit as seconds.
