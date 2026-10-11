// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockAdd, mockListCurrentByFlow, mockWarn } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockListCurrentByFlow: vi.fn(),
  mockWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  defaultQueue: { add: mockAdd },
  DefaultJobAction: {
    syncWelcomeMessageFlows: "syncWelcomeMessageFlows",
    deleteWelcomeMessageFlows: "deleteWelcomeMessageFlows",
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  messengerWelcomeMessageFlowRepository: {
    listCurrentByFlow: mockListCurrentByFlow,
  },
}))
vi.mock("../src/logger", () => ({ logger: { warn: mockWarn } }))

const { messengerWelcomeMessageFlowService: service } = await import(
  "../src/messenger-welcome-message-flow/service"
)

describe("messengerWelcomeMessageFlowService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("enqueueSync debounces per reason and flow with a colon-free id", async () => {
    await service.enqueueSync({
      workspaceId: "1",
      flowId: "2",
      reason: "publish",
    })
    const [name, job, opts] = mockAdd.mock.calls[0]
    expect(name).toBe("syncWelcomeMessageFlows")
    expect(job).toEqual({
      type: "syncWelcomeMessageFlows",
      data: { workspaceId: "1", flowId: "2", reason: "publish" },
    })
    expect(opts).toMatchObject({
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      delay: 5000,
      removeOnComplete: true,
      removeOnFail: true,
      deduplication: {
        id: "welcome-message-flow-publish-2",
        ttl: 5000,
        extend: true,
        replace: true,
        keepLastIfActive: true,
      },
    })
    expect(opts.deduplication.id).not.toContain(":")
  })

  test("enqueueDelete adds one single-attempt job for the flow ids", async () => {
    await service.enqueueDelete({ workspaceId: "1", flowIds: ["2", "3"] })
    expect(mockAdd).toHaveBeenCalledWith(
      "deleteWelcomeMessageFlows",
      {
        type: "deleteWelcomeMessageFlows",
        data: { workspaceId: "1", flowIds: ["2", "3"] },
      },
      { attempts: 1, removeOnComplete: true, removeOnFail: true },
    )
  })

  test("enqueue failures are swallowed and logged", async () => {
    mockAdd.mockRejectedValueOnce(new Error("redis down"))
    await expect(
      service.enqueueSync({ workspaceId: "1", flowId: "2", reason: "rename" }),
    ).resolves.toBeUndefined()
    mockAdd.mockRejectedValueOnce(new Error("redis down"))
    await expect(
      service.enqueueDelete({ workspaceId: "1", flowIds: ["2"] }),
    ).resolves.toBeUndefined()
    expect(mockWarn).toHaveBeenCalledTimes(2)
  })

  test("enqueueDelete is a no-op for an empty id list", async () => {
    await service.enqueueDelete({ workspaceId: "1", flowIds: [] })
    expect(mockAdd).not.toHaveBeenCalled()
  })

  test("listCurrentByFlow renames metaFlowId to welcomeMessageFlowId", async () => {
    mockListCurrentByFlow.mockResolvedValue([
      { integrationMessengerId: "3", pageId: "p", metaFlowId: "m" },
    ])
    expect(
      await service.listCurrentByFlow({ workspaceId: "1", flowId: "2" }),
    ).toEqual([
      { integrationMessengerId: "3", pageId: "p", welcomeMessageFlowId: "m" },
    ])
  })
})
