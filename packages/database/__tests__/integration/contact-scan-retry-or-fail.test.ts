// @vitest-environment node

/**
 * `retryOrFailContactScanRun` against a real Postgres: one atomic UPDATE that
 * hands a scan back to the sweeper (`init`) while it has attempts left and fails
 * it on the spot on the last one. Skipped unless `DATABASE_URL` is reachable.
 */

import { createId } from "@chatbotx.io/utils"
import { eq } from "drizzle-orm"
import { afterAll, describe, expect, test } from "vitest"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

describe.skipIf(!databaseUrl)("retryOrFailContactScanRun", async () => {
  const { db } = await import("../../src/client")
  const { coexistSyncRunRepository } = await import(
    "../../src/repositories/coexist-sync-run/repository"
  )
  const { coexistSyncRunModel } = await import("../../src/schema")

  const workspaceId = createId()
  const MAX_ATTEMPTS = 5

  const claimedScan = async (attempts: number) => {
    const run = await coexistSyncRunRepository.createContactScanRun({
      workspaceId,
      integrationId: createId(),
      channel: "messenger",
      requestedByUserId: null,
      scanFromAt: new Date(Date.now() - 3_600_000),
      triggerSource: "test",
    })
    if (!run) {
      throw new Error("scan not created")
    }
    const claimed = await coexistSyncRunRepository.claimContactScanRun({
      runId: run.id,
    })
    await coexistSyncRunRepository.updateProgress({
      runId: run.id,
      fields: { attempts, resumeCursor: "cursor-1" },
      expect: { status: "running", claimToken: claimed?.claimToken },
    })
    return { runId: run.id, claimToken: claimed?.claimToken ?? null }
  }

  const retryOrFail = (runId: string, claimToken: string | null) =>
    coexistSyncRunRepository.retryOrFailContactScanRun({
      runId,
      maxAttempts: MAX_ATTEMPTS,
      retryError: "providerRetryable",
      exhaustedError: "maxAttempts",
      expect: { status: "running", claimToken },
    })

  const readRun = async (id: string) => {
    const [row] = await db
      .select({
        status: coexistSyncRunModel.status,
        currentError: coexistSyncRunModel.currentError,
        resumeCursor: coexistSyncRunModel.resumeCursor,
        finishedAt: coexistSyncRunModel.finishedAt,
        attempts: coexistSyncRunModel.attempts,
        claimToken: coexistSyncRunModel.claimToken,
      })
      .from(coexistSyncRunModel)
      .where(eq(coexistSyncRunModel.id, id))
    return row
  }

  afterAll(async () => {
    await db
      .delete(coexistSyncRunModel)
      .where(eq(coexistSyncRunModel.workspaceId, workspaceId))
  })

  test("releasing for a wait can reset attempts, so the sweeper cannot fail the idle run", async () => {
    const { runId, claimToken } = await claimedScan(MAX_ATTEMPTS)

    await coexistSyncRunRepository.yieldForContinuation({
      runId,
      expect: { status: "running", claimToken },
      attempts: 1,
    })

    const row = await readRun(runId)
    expect(row.attempts).toBe(1)
    expect(row.claimToken).toBeNull()
    expect(row.status).toBe("running")
  })

  test("releasing without an attempts value leaves the count alone", async () => {
    const { runId, claimToken } = await claimedScan(3)

    await coexistSyncRunRepository.yieldForContinuation({
      runId,
      expect: { status: "running", claimToken },
    })

    expect((await readRun(runId)).attempts).toBe(3)
  })

  test("with attempts left it goes back to init and keeps its resume cursor", async () => {
    const { runId, claimToken } = await claimedScan(MAX_ATTEMPTS - 1)

    expect(await retryOrFail(runId, claimToken)).toBe("retry")

    const row = await readRun(runId)
    expect(row.status).toBe("init")
    expect(row.currentError).toBe("providerRetryable")
    expect(row.resumeCursor).toBe("cursor-1")
    expect(row.finishedAt).toBeNull()
  })

  test("on the last attempt it fails immediately and clears the cursor", async () => {
    const { runId, claimToken } = await claimedScan(MAX_ATTEMPTS)

    expect(await retryOrFail(runId, claimToken)).toBe("failed")

    const row = await readRun(runId)
    expect(row.status).toBe("failed")
    expect(row.currentError).toBe("maxAttempts")
    expect(row.resumeCursor).toBeNull()
    expect(row.finishedAt).not.toBeNull()
  })

  // The sweeper's pick (`pickDueRuns`) does `attempts + 1` and sets `init`; it is
  // replayed here because the real query sweeps every scan in the database.
  const sweeperPick = async (runId: string) => {
    const [row] = await db
      .select({ attempts: coexistSyncRunModel.attempts })
      .from(coexistSyncRunModel)
      .where(eq(coexistSyncRunModel.id, runId))
    await coexistSyncRunRepository.updateProgress({
      runId,
      fields: { status: "init", attempts: row.attempts + 1 },
    })
    const claimed = await coexistSyncRunRepository.claimContactScanRun({
      runId,
    })
    return claimed?.claimToken ?? null
  }

  test.each([
    ["a fresh run", false],
    ["a run that already finished a page", true],
  ])("%s fails on exactly the 5th consecutive failure", async (_name, afterFinishedPage) => {
    // Fresh: the first sweeper pick leaves the claim at attempts = 1.
    let { runId, claimToken } = await claimedScan(1)
    if (afterFinishedPage) {
      // What the engine's progress write does after a completed page.
      await coexistSyncRunRepository.updateProgress({
        runId,
        fields: { attempts: 1 },
        expect: { status: "running", claimToken },
      })
    }

    const outcomes: string[] = []
    for (let failure = 1; failure <= MAX_ATTEMPTS; failure++) {
      const outcome = await retryOrFail(runId, claimToken)
      outcomes.push(String(outcome))
      if (outcome === "retry") {
        claimToken = await sweeperPick(runId)
      }
    }

    expect(outcomes).toEqual(["retry", "retry", "retry", "retry", "failed"])
    expect((await readRun(runId)).status).toBe("failed")
  })

  test("a lost claim (cancelled or taken over) writes nothing", async () => {
    const { runId } = await claimedScan(1)

    expect(await retryOrFail(runId, "someone-elses-token")).toBeNull()
    expect((await readRun(runId)).status).toBe("running")
  })
})
