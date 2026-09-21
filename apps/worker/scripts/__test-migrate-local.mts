/**
 * LOCAL integration test for the migration against a REAL Redis, INCLUDING a
 * concurrent worker draining the source (the production condition Codex flagged
 * that an isolated test misses).
 * Run: REDIS_TEST_PORT=6399 pnpm --filter worker exec tsx scripts/__test-migrate-local.mts
 */
import { Queue, Worker } from "bullmq"
import {
  deleteWaitingTargetsById,
  moveWaitingTargetsToLow,
  snapshotWaitingIds,
} from "./migrate-coexist-jobs"

const connection = {
  host: "127.0.0.1",
  port: Number(process.env.REDIS_TEST_PORT ?? 6399),
}
const TARGET = new Set(["coexistAttachmentDownload", "updateContactAvatar"])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`)
  } else {
    failures++
    console.error(`  ✗ FAIL: ${msg}`)
  }
}
async function waitForState(q: Queue, id: string, state: string, ms = 3000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const j = await q.getJob(id)
    if (j && (await j.getState()) === state) {
      return
    }
    await sleep(20)
  }
  throw new Error(`timeout waiting ${id} -> ${state}`)
}
function avatar(i: number) {
  return {
    name: "updateContactAvatar",
    data: {
      type: "updateContactAvatar",
      data: {
        workspaceId: "ws",
        contactInboxId: `ci-${i}`,
        sourceId: `s-${i}`,
      },
    },
    opts: { jobId: `update-avatar-ci-${i}`, attempts: 2 },
  }
}
function attach(i: number) {
  return {
    name: "coexistAttachmentDownload",
    data: {
      type: "coexistAttachmentDownload",
      data: {
        attachmentId: `a-${i}`,
        workspaceId: "ws",
        channel: "messenger",
        integrationId: "int",
      },
    },
    opts: { jobId: `att-${i}`, attempts: 5 },
  }
}

async function scenarioBasic(integration: Queue, low: Queue) {
  console.log("\n[A] Basic move (no concurrency)")
  await integration.obliterate({ force: true })
  await low.obliterate({ force: true })
  for (let i = 1; i <= 25; i++) {
    await integration.add(avatar(i).name, avatar(i).data, avatar(i).opts)
  }
  for (let i = 1; i <= 25; i++) {
    await integration.add(attach(i).name, attach(i).data, attach(i).opts)
  }
  for (let i = 1; i <= 10; i++) {
    await integration.add(
      "incomingMessage",
      { type: "incomingMessage", data: { messageId: `m-${i}` } },
      { jobId: `msg-${i}` },
    )
  }
  // runnable dup already on low
  await low.add(avatar(1).name, avatar(1).data, avatar(1).opts)

  const dryIds = await snapshotWaitingIds(integration)
  const dry = await moveWaitingTargetsToLow({
    source: integration,
    target: low,
    targetNames: TARGET,
    ids: dryIds,
    execute: false,
  })
  assert(dry.moved === 50, `dry-run counts 50 targets (got ${dry.moved})`)
  assert(
    (await integration.getWaitingCount()) === 60,
    "dry-run leaves integration untouched",
  )

  const ids = await snapshotWaitingIds(integration)
  const run = await moveWaitingTargetsToLow({
    source: integration,
    target: low,
    targetNames: TARGET,
    ids,
    execute: true,
  })
  assert(
    run.moved + run.dedupedRunnable === 50,
    `moved+deduped = 50 (moved=${run.moved} deduped=${run.dedupedRunnable})`,
  )
  assert(
    (await integration.getWaitingCount()) === 10,
    `integration keeps 10 non-target (got ${await integration.getWaitingCount()})`,
  )
  assert(
    (await low.getWaitingCount()) === 50,
    `low has 50, collision deduped (got ${await low.getWaitingCount()})`,
  )
  assert(
    (await integration.getJob("msg-5")) != null &&
      (await low.getJob("msg-5")) == null,
    "non-target stays on integration, not moved",
  )
  const a10 = await low.getJob("att-10")
  const a10Payload = a10?.data as
    | { data?: { attachmentId?: string } }
    | undefined
  assert(
    a10?.name === "coexistAttachmentDownload" &&
      a10Payload?.data?.attachmentId === "a-10",
    "moved att-10 keeps name+payload",
  )
  const rerun = await moveWaitingTargetsToLow({
    source: integration,
    target: low,
    targetNames: TARGET,
    ids: await snapshotWaitingIds(integration),
    execute: true,
  })
  assert(
    rerun.moved === 0 && (await low.getWaitingCount()) === 50,
    "re-run idempotent (0 moved, no dupes)",
  )
}

async function scenarioConcurrency(integration: Queue, low: Queue) {
  console.log(
    "\n[B] Concurrency: worker draining source WHILE migrating (the critical case)",
  )
  await integration.obliterate({ force: true })
  await low.obliterate({ force: true })
  const N = 150
  for (let i = 1; i <= N; i++) {
    await integration.add(avatar(i).name, avatar(i).data, avatar(i).opts)
    await integration.add(attach(i).name, attach(i).data, attach(i).opts)
  }
  for (let i = 1; i <= 20; i++) {
    await integration.add(
      "incomingMessage",
      { type: "incomingMessage", data: {} },
      { jobId: `m2-${i}` },
    )
  }
  const targetIds = new Set<string>()
  for (let i = 1; i <= N; i++) {
    targetIds.add(`update-avatar-ci-${i}`)
    targetIds.add(`att-${i}`)
  }

  const completedByWorker = new Set<string>()
  // Live worker draining the source from the head, mutating the list — exactly
  // what breaks naive offset pagination.
  const worker = new Worker(
    "integration",
    async (job) => {
      await sleep(3 + Math.random() * 6)
      if (job.id && TARGET.has(job.name)) {
        completedByWorker.add(job.id)
      }
    },
    { connection, concurrency: 4, removeOnComplete: { count: 0 } },
  )

  // Migrate concurrently.
  const ids = await snapshotWaitingIds(integration)
  const stats = await moveWaitingTargetsToLow({
    source: integration,
    target: low,
    targetNames: TARGET,
    ids,
    execute: true,
  })
  // Let the worker drain whatever remains.
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const c = await integration.getJobCounts("waiting", "active")
    if ((c.waiting ?? 0) + (c.active ?? 0) === 0) {
      break
    }
    await sleep(50)
  }
  await worker.close()

  console.log("  migration stats:", stats)
  const intWaiting = await integration.getWaitingCount()
  assert(intWaiting === 0, `integration fully drained (waiting=${intWaiting})`)

  // No target lost: every target id is on low OR was completed by the worker.
  let lost = 0
  const onLow: string[] = []
  for (const id of targetIds) {
    const l = await low.getJob(id)
    if (l) {
      onLow.push(id)
    } else if (!completedByWorker.has(id)) {
      lost++
    }
  }
  assert(
    lost === 0,
    `NO target job lost under concurrency (lost=${lost}, onLow=${onLow.length}, workerDone=${completedByWorker.size})`,
  )
}

async function scenarioDestFailed(integration: Queue, low: Queue) {
  console.log(
    "\n[C] Destination has a retained FAILED dup (must not lose work)",
  )
  await integration.obliterate({ force: true })
  await low.obliterate({ force: true })
  await integration.add(avatar(1).name, avatar(1).data, avatar(1).opts) // update-avatar-ci-1
  // Create a FAILED job on low with the same id (attempts:1 → fails, retained).
  const w = new Worker("low", () => Promise.reject(new Error("boom")), {
    connection,
    concurrency: 1,
  })
  await low.add(avatar(1).name, avatar(1).data, {
    jobId: "update-avatar-ci-1",
    attempts: 1,
  })
  await waitForState(low, "update-avatar-ci-1", "failed")
  await w.close()

  const ids = await snapshotWaitingIds(integration)
  const stats = await moveWaitingTargetsToLow({
    source: integration,
    target: low,
    targetNames: TARGET,
    ids,
    execute: true,
  })
  assert(
    stats.requeuedFailed === 1,
    `cleared the failed dup and re-added (requeuedFailed=${stats.requeuedFailed})`,
  )
  const dest = await low.getJob("update-avatar-ci-1")
  assert(
    (await dest?.getState()) === "waiting",
    "low job is now runnable (waiting), not failed",
  )
  assert(
    (await integration.getJob("update-avatar-ci-1")) == null,
    "source removed only after runnable dest exists",
  )
}

async function scenarioDestCompleted(integration: Queue, low: Queue) {
  console.log(
    "\n[D] Destination already COMPLETED the job (drop source, no re-add)",
  )
  await integration.obliterate({ force: true })
  await low.obliterate({ force: true })
  await integration.add(attach(1).name, attach(1).data, attach(1).opts) // att-1
  const w = new Worker("low", () => Promise.resolve(), {
    connection,
    concurrency: 1,
  })
  await low.add(attach(1).name, attach(1).data, { jobId: "att-1", attempts: 1 })
  await waitForState(low, "att-1", "completed")
  await w.close()

  const before = await low.getJobCounts("waiting")
  const ids = await snapshotWaitingIds(integration)
  const stats = await moveWaitingTargetsToLow({
    source: integration,
    target: low,
    targetNames: TARGET,
    ids,
    execute: true,
  })
  assert(
    stats.alreadyDone === 1,
    `recognized completed dup (alreadyDone=${stats.alreadyDone})`,
  )
  assert(
    (await integration.getJob("att-1")) == null,
    "source removed (work already done on low)",
  )
  assert(
    (await low.getWaitingCount()) === (before.waiting ?? 0),
    "no new waiting job re-added for a completed dup",
  )
}

async function scenarioDelete(low: Queue) {
  console.log("\n[E] Delete: remove ONLY coexistAttachmentDownload (waiting)")
  await low.obliterate({ force: true })
  const ATT = new Set(["coexistAttachmentDownload"])
  for (let i = 1; i <= 30; i++) {
    await low.add(attach(i).name, attach(i).data, attach(i).opts)
  }
  for (let i = 1; i <= 15; i++) {
    await low.add(avatar(i).name, avatar(i).data, avatar(i).opts) // must NOT be deleted
  }

  // Dry run counts but deletes nothing.
  const dry = await deleteWaitingTargetsById({
    queue: low,
    targetNames: ATT,
    ids: await snapshotWaitingIds(low),
    execute: false,
  })
  assert(
    dry.deleted === 30,
    `dry-run counts 30 attachment jobs (got ${dry.deleted})`,
  )
  assert((await low.getWaitingCount()) === 45, "dry-run deletes nothing")

  const run = await deleteWaitingTargetsById({
    queue: low,
    targetNames: ATT,
    ids: await snapshotWaitingIds(low),
    execute: true,
  })
  assert(
    run.deleted === 30,
    `deleted all 30 attachment jobs (got ${run.deleted})`,
  )
  assert(
    (await low.getWaitingCount()) === 15,
    `only 15 avatar jobs remain (got ${await low.getWaitingCount()})`,
  )
  assert((await low.getJob("att-10")) == null, "attachment att-10 deleted")
  assert((await low.getJob("update-avatar-ci-3")) != null, "avatar NOT deleted")

  const rerun = await deleteWaitingTargetsById({
    queue: low,
    targetNames: ATT,
    ids: await snapshotWaitingIds(low),
    execute: true,
  })
  assert(rerun.deleted === 0, "re-run deletes 0 (nothing left)")
}

async function main() {
  const integration = new Queue("integration", { connection })
  const low = new Queue("low", { connection })
  await scenarioBasic(integration, low)
  await scenarioConcurrency(integration, low)
  await scenarioDestFailed(integration, low)
  await scenarioDestCompleted(integration, low)
  await scenarioDelete(low)
  await integration.obliterate({ force: true })
  await low.obliterate({ force: true })
  await integration.close()
  await low.close()
  console.log(
    failures === 0
      ? "\n✅ ALL ASSERTIONS PASSED"
      : `\n❌ ${failures} ASSERTION(S) FAILED`,
  )
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
