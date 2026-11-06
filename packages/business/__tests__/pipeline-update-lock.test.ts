// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  lockOptions: vi.fn(),
  assertEditable: vi.fn(),
  acquireAdvisory: vi.fn(),
}))

vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { marker: "db" },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  acquirePipelineAdvisoryLock: mocks.acquireAdvisory,
  pipelineActivityRepository: {},
  pipelineItemRepository: {},
  pipelineRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
  pipelineStageRepository: {},
}))

vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    assertDeletable: vi.fn(),
    assertResourceEditable: mocks.assertEditable,
  }),

  changedKeysOf: vi.fn((_existing: unknown, patch: Record<string, unknown>) =>
    Object.keys(patch),
  ),
}))

const lockedTx = { marker: "locked-tx" }
vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: (
    run: (tx: unknown) => unknown,
    options?: unknown,
  ) => {
    mocks.lockOptions(options)
    return run(lockedTx)
  },
}))

vi.mock("../src/pipeline/currency", () => ({
  applyEffectiveCurrency: vi.fn(),
  resolveWorkspaceCurrency: vi.fn(),
  withEffectiveCurrencies: vi.fn(),
  withEffectiveCurrency: vi.fn(async (_ws: string, row: unknown) => row),
}))

const { pipelineService } = await import("../src/pipeline/service")

const WS = "ws-1"
const stored = { id: "pipe-1", workspaceId: WS, name: "Old", settings: {} }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findById.mockResolvedValue(stored)
  mocks.update.mockResolvedValue({ ...stored, currency: "USD" })
  vi.spyOn(pipelineService, "requireAccess").mockResolvedValue(stored as never)
  vi.spyOn(
    pipelineService as unknown as { afterStructureChange: () => Promise<void> },
    "afterStructureChange",
  ).mockResolvedValue(undefined)
  vi.spyOn(
    pipelineService as unknown as { audit: () => Promise<void> },
    "audit",
  ).mockResolvedValue(undefined)
})

describe("pipelineService.update template lock", () => {
  test("locks the pipeline, then reads the stored row on the locked transaction before diffing", async () => {
    await pipelineService.update({
      workspaceId: WS,
      id: "pipe-1",
      scope: { kind: "token" } as never,
      values: { currency: "USD" },
    })

    expect(mocks.lockOptions).toHaveBeenCalledWith({
      workspaceId: expect.any(String),
      initialKeys: [{ kind: "pipeline", resourceId: "pipe-1" }],
    })
    expect(mocks.findById).toHaveBeenCalledWith(
      { workspaceId: WS, id: "pipe-1" },
      lockedTx,
    )
    expect(mocks.lockOptions.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findById.mock.invocationCallOrder[0] as number,
    )
    expect(mocks.findById.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.assertEditable.mock.invocationCallOrder[0] as number,
    )
    expect(mocks.assertEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "pipeline",
        resourceIds: ["pipe-1"],
        changedKeys: ["currency"],
        tx: lockedTx,
      }),
    )
    expect(mocks.assertEditable.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0] as number,
    )
  })

  test("a pipeline deleted before the lock is not found and nothing is written", async () => {
    mocks.findById.mockResolvedValue(undefined)

    await expect(
      pipelineService.update({
        workspaceId: WS,
        id: "pipe-1",
        scope: { kind: "token" } as never,
        values: { currency: "USD" },
      }),
    ).rejects.toThrow("Pipeline not found")
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
