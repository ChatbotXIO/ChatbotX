/**
 * FORWARD-ONLY SHIM removal gate for the heavy-worker/coexist split
 * (docs/plans/2026-08-30-heavy-worker-coexist-split.md, Phase 3).
 *
 * The 5 coexist actions (`coexistWhatsappBuffer`, `coexistWhatsappFlush`,
 * `coexistMessengerSync`, `coexistInstagramSync`,
 * `coexistAttachmentDownload`) moved from the `integration` queue to the new
 * `heavy` queue/worker. `bull:integration` survives a deploy, so the
 * integration worker keeps a FORWARD-ONLY SHIM block
 * (`apps/worker/src/integration/worker.ts`) that forwards any already-queued
 * coexist job it finds there into the `heavy` queue. This script is the
 * removal gate for that block: it reports how many coexist jobs remain in
 * `bull:integration`, and exits non-zero while any are left.
 *
 * NEVER writes anything — read-only via `Queue.getJobs`.
 *
 * Usage:
 *   pnpm tsx scripts/check-coexist-drain.mts [envFile]
 *
 * Defaults to `.env`. Requires REDIS_URL (no DB access needed).
 */

const [envFile = ".env"] = process.argv.slice(2)
process.loadEnvFile(envFile)
process.env.SKIP_ENV_CHECK = "true"

// Import AFTER env is loaded — package env schemas read process.env at import
// time. Imported by relative path (not the `@chatbotx.io/worker-config` bare
// specifier) because this script lives at the repo root, outside any
// workspace package's own dependency graph — Node resolves a relative
// import's bare specifiers against ITS OWN location, so this reaches
// `packages/worker-config`'s node_modules instead of the repo root's (which
// does not depend on `@chatbotx.io/worker-config` at all). Mirrors the same
// trick `scripts/debug-run-job.mts` and
// `scripts/audit-bot-field-reserved-names.mts` use.
const { HeavyJobAction, integrationQueue } = await import(
  "../packages/worker-config/src/index.ts"
)

const COEXIST_JOB_TYPES: ReadonlySet<string> = new Set(
  Object.values(HeavyJobAction),
)

const DRAIN_STATUSES = ["delayed", "waiting", "active", "failed"] as const

type JobCounts = Record<string, number>

async function countRemainingCoexistJobs(): Promise<JobCounts> {
  const jobs = await integrationQueue.getJobs([...DRAIN_STATUSES])
  const counts: JobCounts = {}

  for (const job of jobs) {
    const type =
      job.data && typeof job.data === "object" && "type" in job.data
        ? String((job.data as { type: unknown }).type)
        : undefined
    if (!(type && COEXIST_JOB_TYPES.has(type))) {
      continue
    }
    counts[type] = (counts[type] ?? 0) + 1
  }

  return counts
}

console.log(
  `Checking bull:integration for legacy coexist jobs (${DRAIN_STATUSES.join(", ")})...`,
)

const counts = await countRemainingCoexistJobs()
const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

if (total > 0) {
  console.error("Legacy coexist jobs still remain in bull:integration:")
  for (const [type, count] of Object.entries(counts)) {
    console.error(`  ${type}: ${count}`)
  }
  console.error(
    "\nDo NOT remove the FORWARD-ONLY SHIM block yet — re-run this script after the drain window.",
  )
  process.exitCode = 1
} else {
  console.log(
    "Clean: no legacy coexist jobs remain in bull:integration. Safe to remove the FORWARD-ONLY SHIM block and this script.",
  )
  process.exitCode = 0
}

// Redis connection keeps the event loop alive — force exit.
setTimeout(() => process.exit(process.exitCode ?? 0), 500)
