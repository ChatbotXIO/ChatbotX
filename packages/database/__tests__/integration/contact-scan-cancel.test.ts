// @vitest-environment node

/**
 * `cancelActiveContactScanRuns` against a real Postgres: a live scan on the
 * integration is ended as `partial` + the caller's sentinel, while settled
 * scans, other integrations, other workspaces and `coexist` rows are untouched.
 * Skipped unless `DATABASE_URL` is reachable; run with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { createId } from "@chatbotx.io/utils"
import { eq } from "drizzle-orm"
import { afterAll, describe, expect, test } from "vitest"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

describe.skipIf(!databaseUrl)("cancelActiveContactScanRuns", async () => {
  const { db } = await import("../../src/client")
  const { coexistSyncRunRepository } = await import(
    "../../src/repositories/coexist-sync-run/repository"
  )
  const { coexistSyncRunModel } = await import("../../src/schema")

  const workspaceId = createId()
  const otherWorkspaceId = createId()
  const SENTINEL = "cancelled"

  const readRun = async (id: string) => {
    const [row] = await db
      .select({
        status: coexistSyncRunModel.status,
        currentError: coexistSyncRunModel.currentError,
        claimToken: coexistSyncRunModel.claimToken,
        resumeCursor: coexistSyncRunModel.resumeCursor,
        finishedAt: coexistSyncRunModel.finishedAt,
      })
      .from(coexistSyncRunModel)
      .where(eq(coexistSyncRunModel.id, id))
    return row
  }

  const createScan = async (input: { integrationId: string }) => {
    const run = await coexistSyncRunRepository.createContactScanRun({
      workspaceId,
      integrationId: input.integrationId,
      channel: "messenger",
      requestedByUserId: null,
      scanFromAt: new Date(Date.now() - 3_600_000),
      triggerSource: "test",
    })
    if (!run) {
      throw new Error("scan not created")
    }
    return run.id
  }

  const cancel = (integrationId: string, scopeWorkspace = true) =>
    coexistSyncRunRepository.cancelActiveContactScanRuns({
      channel: "messenger",
      integrationId,
      workspaceId: scopeWorkspace ? workspaceId : undefined,
      currentError: SENTINEL,
    })

  afterAll(async () => {
    for (const id of [workspaceId, otherWorkspaceId]) {
      await db
        .delete(coexistSyncRunModel)
        .where(eq(coexistSyncRunModel.workspaceId, id))
    }
  })

  test("an init scan is ended as partial with the sentinel", async () => {
    const integrationId = createId()
    const runId = await createScan({ integrationId })

    expect(await cancel(integrationId)).toBe(1)

    const row = await readRun(runId)
    expect(row.status).toBe("partial")
    expect(row.currentError).toBe(SENTINEL)
    expect(row.finishedAt).not.toBeNull()
  })

  test("a running scan loses its claim and cursor so the worker's next write is fenced out", async () => {
    const integrationId = createId()
    const runId = await createScan({ integrationId })
    const claimed = await coexistSyncRunRepository.claimContactScanRun({
      runId,
    })
    await coexistSyncRunRepository.updateProgress({
      runId,
      fields: { resumeCursor: "cursor-1" },
      expect: { status: "running", claimToken: claimed?.claimToken },
    })

    expect(await cancel(integrationId)).toBe(1)

    const row = await readRun(runId)
    expect(row.status).toBe("partial")
    expect(row.claimToken).toBeNull()
    expect(row.resumeCursor).toBeNull()
    // The worker still holding the old token writes zero rows.
    const stale = await coexistSyncRunRepository.updateProgress({
      runId,
      fields: { currentStep: "late write" },
      expect: { status: "running", claimToken: claimed?.claimToken },
    })
    expect(stale).toBe(0)
  })

  test("a released (running, no token) scan between chunks is cancelled too", async () => {
    const integrationId = createId()
    const runId = await createScan({ integrationId })
    const claimed = await coexistSyncRunRepository.claimContactScanRun({
      runId,
    })
    await coexistSyncRunRepository.yieldForContinuation({
      runId,
      expect: { status: "running", claimToken: claimed?.claimToken },
    })

    expect(await cancel(integrationId)).toBe(1)
    expect((await readRun(runId)).status).toBe("partial")
    // A continuation job can no longer claim it.
    expect(
      await coexistSyncRunRepository.claimContactScanRun({ runId }),
    ).toBeNull()
  })

  test("nothing running returns 0, and a settled scan is left alone", async () => {
    const integrationId = createId()
    const runId = await createScan({ integrationId })
    await coexistSyncRunRepository.markSucceeded({ runId })

    expect(await cancel(integrationId)).toBe(0)
    const row = await readRun(runId)
    expect(row.status).toBe("succeeded")
    expect(row.currentError).toBeNull()
  })

  test("a second cancel is a no-op", async () => {
    const integrationId = createId()
    await createScan({ integrationId })
    expect(await cancel(integrationId)).toBe(1)
    expect(await cancel(integrationId)).toBe(0)
  })

  test("another integration and a coexist row are untouched", async () => {
    const integrationId = createId()
    const otherIntegrationId = createId()
    const coexistIntegrationId = createId()
    const target = await createScan({ integrationId })
    const otherIntegration = await createScan({
      integrationId: otherIntegrationId,
    })
    const coexist = await coexistSyncRunRepository.createRun({
      workspaceId,
      integrationId: coexistIntegrationId,
      channel: "messenger",
      triggerSource: "manual",
    })

    expect(await cancel(integrationId)).toBe(1)
    expect(await cancel(coexistIntegrationId)).toBe(0)

    expect((await readRun(target)).status).toBe("partial")
    expect((await readRun(otherIntegration)).status).toBe("init")
    expect((await readRun(coexist.id)).status).toBe("init")
  })

  test("another workspace cannot cancel the scan", async () => {
    const integrationId = createId()
    const runId = await createScan({ integrationId })

    const cancelled =
      await coexistSyncRunRepository.cancelActiveContactScanRuns({
        channel: "messenger",
        integrationId,
        workspaceId: otherWorkspaceId,
        currentError: SENTINEL,
      })

    expect(cancelled).toBe(0)
    expect((await readRun(runId)).status).toBe("init")
  })

  test("without a workspace (disconnect teardown) it still ends the integration's scan", async () => {
    const integrationId = createId()
    const runId = await createScan({ integrationId })

    expect(await cancel(integrationId, false)).toBe(1)
    expect((await readRun(runId)).status).toBe("partial")
  })
})
