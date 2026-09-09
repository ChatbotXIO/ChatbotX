# Automatic Customer Scan

Creates ChatbotX contacts from a channel's existing conversation history — the
operator picks a connected inbox and a "scan from" time, and a background job
walks the channel's conversation list newest→oldest, stopping at that time, and
imports every participant who is not already a contact. Ported from v1's
"Quét Khách Hàng Tự Động". Messenger only today (Instagram/Zalo are follow-ups).

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
   ├── done          → succeeded | partial (some pages failed) | failed
   ├── transient err → resetForRetry (status='init'); sweeper re-drives; markMaxAttemptsFailed after 5 attempts
   └── auth/permission err → failed (currentError sentinel)
```

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
   `loadContext` / `listPage` / `classifyError` for the channel's conversation API.

The `satisfies Record<ContactScanChannel, …>` on the registry and the adapter map
makes a missing channel a compile error — no other file needs a channel branch.
