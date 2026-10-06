/**
 * Backfills `Connection` rows for every pre-existing Inbox/Integration
 * satellite row that predates the `Connection` table.
 *
 * Mechanism: for each provider, pull candidate rows via a keyset-paginated
 * SELECT (Inbox x satellite for channels, Integration x satellite for
 * workspace integrations), compute the desired `Connection` row in TypeScript
 * (status mapping is a small decision table, far more legible here than as a
 * SQL CASE tree), then bulk `INSERT ... ON CONFLICT (workspaceId, provider,
 * sourceId) DO NOTHING`, batched per provider with one transaction per batch.
 * A second run always inserts 0 new rows (`--verify` proves this).
 *
 * This intentionally does NOT call `upsertConnectionRow` / go through
 * `@chatbotx.io/business`'s connection engine: `@chatbotx.io/database` cannot
 * depend on `@chatbotx.io/business` (the dependency points the other way),
 * and this backfill never touches `UserQuota`/`WorkspaceUsage` — it is a pure
 * backfill of `Connection` rows, not a quota recompute. `authExpiresAtOf`'s
 * one-line logic is duplicated locally (see `backfill-connections/status.ts`)
 * for the same layering reason.
 *
 * Usage:
 *   pnpm --filter @chatbotx.io/database db:backfill-connections -- --dry-run
 *   pnpm --filter @chatbotx.io/database db:backfill-connections
 *   pnpm --filter @chatbotx.io/database db:backfill-connections -- --provider=whatsapp --workspace=123
 *   pnpm --filter @chatbotx.io/database db:backfill-connections -- --verify
 *
 * Flags:
 *   --dry-run          Count + print a sample of what would be inserted. No writes.
 *   --provider=<type>  Restrict to one `IntegrationType`.
 *   --workspace=<id>   Restrict to one workspace id.
 *   --verify           Report (1) Inbox rows (for every backfilled channel type that
 *                      HAS a satellite row) with no matching Connection row, (2)
 *                      Integration rows (for every backfilled integration type) with
 *                      no matching Connection row, (3) Connection rows whose status
 *                      disagrees with their source — compared through
 *                      `CONNECTION_TO_INBOX_DISCONNECT_REASON` so a live engine
 *                      transition (`provider_revoked`/`refresh_failed` collapsing to
 *                      the legacy `token_revoked`, `degraded` needing no
 *                      `tokenRefreshError`) isn't a false positive. All three must be 0
 *                      after a successful backfill, and stay 0 on every subsequent run.
 *                      Workspaces with `scheduledDeletionAt`/`purgeStartedAt` set are
 *                      skipped entirely (mid-purge data is noise, not a real gap).
 *                      Also reports, purely informationally, how many of those
 *                      channel-type Inbox rows have NO satellite row at all — the
 *                      backfill can never create a Connection for those (nothing to
 *                      read), so they are excluded from (1) rather than counted as a
 *                      false positive.
 *   --print-owners     With a real (non-`--verify`) run, additionally print the
 *                      distinct `Workspace.ownerId`s of every workspace that got (or,
 *                      under `--dry-run`, would get) at least one Connection row.
 *
 * Quota note: this script never touches `UserQuota`/`WorkspaceUsage` (see above) — but
 * a legacy `needs_reauth` Inbox predating the `Connection` table never released the
 * channel quota slot its connect originally consumed (that release is wired through
 * `ConnectionStateService`, which didn't exist yet). After a real run, the operator
 * MUST reconcile quota for every owner `--print-owners` lists, via
 * `userQuotaService.reconcileOwnerPoolUsage`/`reconcileUserSelfUsage`
 * (`packages/business/src/user-quota/service.ts`) — the same recompute the worker's
 * scheduled `syncUserQuota` job (`apps/worker/src/schedule/handlers/sync-user-quota.ts`)
 * runs nightly, just forced immediately instead of waiting for the next scheduled pass.
 *
 * Skipped entirely (no adapter / no live feature): metaCatalog,
 * outlookCalendar, chatbotx.
 *
 * Implementation lives in `./backfill-connections/`; this file is a thin entry
 * so `tsx scripts/backfill-connections.ts --dry-run`/`--verify` keeps working,
 * and so existing importers can still import from this exact path.
 */

import { main } from "./backfill-connections/cli"

export { parseArgs, printResult } from "./backfill-connections/cli"
export * from "./backfill-connections/index"

// Only auto-run when executed directly (`tsx scripts/backfill-connections.ts`),
// never when another module (e.g. the integration test) imports
// `backfillConnections` from this file.
const isMainModule =
  process.argv[1] === new URL(import.meta.url).pathname ||
  process.argv[1] === import.meta.url

if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Connections backfill failed:", error)
      process.exit(1)
    })
}
