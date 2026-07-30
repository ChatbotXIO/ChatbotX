import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  addBulk: vi.fn(),
  listRecoverable: vi.fn(),
  runExclusive: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  metaCatalogSyncRunService: {
    listRecoverablePushRuns: (...args: unknown[]) =>
      mocks.listRecoverable(...args),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: (...args: unknown[]) => mocks.runExclusive(...args),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {
    checkMetaCatalogSync: "checkMetaCatalogSync",
    submitMetaCatalogSync: "submitMetaCatalogSync",
  },
  defaultQueue: {
    addBulk: (...args: unknown[]) => mocks.addBulk(...args),
  },
}))

const { reconcileMetaCatalogSyncs } = await import(
  "../src/schedule/handlers/reconcile-meta-catalog-syncs"
)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
  mocks.addBulk.mockResolvedValue([])
})

describe("Meta Catalog sync reconciler", () => {
  test("re-drives stale submissions and undispatched status checks", async () => {
    mocks.listRecoverable.mockResolvedValue([
      {
        id: "run-submitting",
        workspaceId: "workspace-1",
        submissionLeaseId: "lease-1",
      },
      {
        id: "run-checking",
        workspaceId: "workspace-2",
        submissionLeaseId: null,
      },
    ])

    await expect(reconcileMetaCatalogSyncs()).resolves.toEqual({
      reconciled: 2,
    })

    const jobs = mocks.addBulk.mock.calls[0]?.[0]
    expect(jobs).toEqual([
      expect.objectContaining({
        name: "submitMetaCatalogSync",
        data: {
          type: "submitMetaCatalogSync",
          data: {
            workspaceId: "workspace-1",
            runId: "run-submitting",
            recovery: true,
          },
        },
      }),
      expect.objectContaining({
        name: "checkMetaCatalogSync",
        data: {
          type: "checkMetaCatalogSync",
          data: {
            workspaceId: "workspace-2",
            runId: "run-checking",
            attempt: 0,
          },
        },
      }),
    ])
    for (const job of jobs) {
      expect(job.opts.jobId).not.toContain(":")
      expect(job.opts).toMatchObject({
        removeOnComplete: true,
        removeOnFail: true,
      })
    }
  })
})
