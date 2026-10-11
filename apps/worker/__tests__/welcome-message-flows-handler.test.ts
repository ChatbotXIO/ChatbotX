import { beforeEach, describe, expect, test, vi } from "vitest"

const m = vi.hoisted(() => ({
  findBy: vi.fn(),
  publishedVersionNumber: vi.fn(),
  getStartNode: vi.fn(),
  buildContext: vi.fn(),
  listByWorkspace: vi.fn(),
  convert: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  isTransient: vi.fn(),
  lockKeys: [] as string[],
  lockOpts: [] as { retryTimeoutInSeconds?: number }[],
  svc: {
    findCurrent: vi.fn(),
    listAllByFlow: vi.fn(),
    insertCurrent: vi.fn(),
    setFlowVersion: vi.fn(),
    markSuperseded: vi.fn(),
    replaceCurrent: vi.fn(),
    deleteByIds: vi.fn(),
  },
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: m.buildContext,
  flowService: { findBy: m.findBy },
  flowVersionService: {
    publishedVersionNumber: m.publishedVersionNumber,
    getMessengerAdsStartNode: m.getStartNode,
  },
  messengerWelcomeMessageFlowService: m.svc,
}))
vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { messenger: "messenger" } },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: {
    listByWorkspace: m.listByWorkspace,
  },
}))
vi.mock("@chatbotx.io/integration-messenger/messenger-ads", () => ({
  convertStartNodeToMessengerAdsJson: m.convert,
}))
vi.mock(
  "@chatbotx.io/integration-messenger/apis/welcome-message-flows",
  () => ({
    createWelcomeMessageFlow: m.create,
    updateWelcomeMessageFlow: m.update,
    deleteWelcomeMessageFlow: m.del,
    getWelcomeMessageFlow: m.get,
    isTransientWelcomeMessageFlowError: m.isTransient,
  }),
)
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: (opts: {
      key: string
      fn: () => unknown
      retryTimeoutInSeconds?: number
    }) => {
      m.lockKeys.push(opts.key)
      m.lockOpts.push(opts)
      return opts.fn()
    },
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  welcomeMessageFlowLockKey: (id: string) => `welcome-message-flow-${id}`,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: m.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const {
  deleteWelcomeMessageFlows,
  formatWelcomeMessageFlowName,
  syncWelcomeMessageFlows,
} = await import("../src/default/handlers/welcome-message-flows")

const pageA = { id: "ia", workspaceId: "1", pageId: "pa", auth: {} }
const pageB = { id: "ib", workspaceId: "1", pageId: "pb", auth: {} }
const msgs = [{ message: { text: "Hi" } }]
const publish = { workspaceId: "1", flowId: "f", reason: "publish" as const }
const rename = { workspaceId: "1", flowId: "f", reason: "rename" as const }
const row = (
  id: string,
  metaFlowId: string,
  integrationMessengerId = "ia",
) => ({
  id,
  metaFlowId,
  integrationMessengerId,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.lockKeys.length = 0
  m.lockOpts.length = 0
  m.findBy.mockResolvedValue({ id: "f", name: "Signup" })
  m.publishedVersionNumber.mockResolvedValue(3)
  m.getStartNode.mockResolvedValue({
    status: "ok",
    flowVersionId: "v3",
    startNode: { id: "n1" },
  })
  m.convert.mockReturnValue({ status: "ok", messages: msgs })
  m.isTransient.mockReturnValue(false)
  m.listByWorkspace.mockResolvedValue([pageA])
  m.buildContext.mockImplementation(
    async ({ integration }: { integration: { pageId: string } }) => ({
      auth: { metadata: { pageId: integration.pageId } },
    }),
  )
})

test("formatWelcomeMessageFlowName appends the version", () => {
  expect(formatWelcomeMessageFlowName("Signup", 3)).toBe("Signup (v3)")
})

describe("syncWelcomeMessageFlows — publish", () => {
  test("creates a Meta flow named '<name> (vN)' and stores it as current", async () => {
    m.svc.findCurrent.mockResolvedValue(undefined)
    m.create.mockResolvedValue({ flowId: "meta1" })

    await syncWelcomeMessageFlows(publish)

    expect(m.lockKeys).toEqual(["welcome-message-flow-f"])
    expect(m.convert).toHaveBeenCalledWith({
      flowId: "f",
      flowVersionId: "v3",
      startNode: { id: "n1" },
      mode: "lenient",
    })
    expect(m.create).toHaveBeenCalledWith({
      ctx: { auth: { metadata: { pageId: "pa" } } },
      name: "Signup (v3)",
      messages: msgs,
    })
    expect(m.svc.insertCurrent).toHaveBeenCalledWith({
      workspaceId: "1",
      flowId: "f",
      integrationMessengerId: "ia",
      pageId: "pa",
      metaFlowId: "meta1",
      flowVersionId: "v3",
    })
  })

  test("reads the start node fresh (uncached) and waits long for the flow lock", async () => {
    m.svc.findCurrent.mockResolvedValue(undefined)
    m.create.mockResolvedValue({ flowId: "meta1" })

    await syncWelcomeMessageFlows(publish)

    expect(m.getStartNode).toHaveBeenCalledWith({
      flowId: "f",
      workspaceId: "1",
      fresh: true,
    })
    expect(m.lockOpts[0].retryTimeoutInSeconds).toBeGreaterThanOrEqual(600)
  })

  test("updates an existing Meta flow in place", async () => {
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))

    await syncWelcomeMessageFlows(publish)

    expect(m.update).toHaveBeenCalledWith({
      ctx: expect.anything(),
      flowId: "meta1",
      name: "Signup (v3)",
      messages: msgs,
    })
    expect(m.svc.setFlowVersion).toHaveBeenCalledWith({
      id: "row1",
      flowVersionId: "v3",
    })
    expect(m.create).not.toHaveBeenCalled()
  })

  test("an update failure on a flow used in an ad supersedes the row and creates a new flow", async () => {
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))
    m.update.mockRejectedValue(new Error("used in ad"))
    m.get.mockResolvedValue({ id: "meta1", is_used_in_ad: true })
    m.create.mockResolvedValue({ flowId: "meta2" })

    await syncWelcomeMessageFlows(publish)

    expect(m.get).toHaveBeenCalledWith({
      ctx: expect.anything(),
      flowId: "meta1",
    })
    expect(m.svc.replaceCurrent).toHaveBeenCalledWith({
      previous: { id: "row1", action: "supersede" },
      next: expect.objectContaining({ metaFlowId: "meta2" }),
    })
    expect(m.svc.markSuperseded).not.toHaveBeenCalled()
    expect(m.svc.insertCurrent).not.toHaveBeenCalled()
  })

  test("a failed create after a used-in-ad update failure keeps the old row current", async () => {
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))
    m.update.mockRejectedValue(new Error("used in ad"))
    m.get.mockResolvedValue({ id: "meta1", is_used_in_ad: true })
    m.create.mockRejectedValue(new Error("Meta down"))

    await syncWelcomeMessageFlows(publish)

    expect(m.svc.replaceCurrent).not.toHaveBeenCalled()
    expect(m.svc.markSuperseded).not.toHaveBeenCalled()
    expect(m.svc.deleteByIds).not.toHaveBeenCalled()
    expect(m.svc.insertCurrent).not.toHaveBeenCalled()
  })

  test("a failed row swap deletes the just-created Meta flow", async () => {
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))
    m.update.mockRejectedValue(new Error("used in ad"))
    m.get.mockResolvedValue({ id: "meta1", is_used_in_ad: true })
    m.create.mockResolvedValue({ flowId: "meta2" })
    m.svc.replaceCurrent.mockRejectedValue(new Error("db down"))
    m.del.mockResolvedValue(undefined)

    await syncWelcomeMessageFlows(publish)

    expect(m.del).toHaveBeenCalledWith({
      ctx: expect.anything(),
      flowId: "meta2",
    })
  })

  test("a failed insert for a first-time page deletes the just-created Meta flow", async () => {
    m.svc.findCurrent.mockResolvedValue(undefined)
    m.create.mockResolvedValue({ flowId: "meta1" })
    m.svc.insertCurrent.mockRejectedValue(new Error("db down"))
    m.del.mockResolvedValue(undefined)

    await syncWelcomeMessageFlows(publish)

    expect(m.del).toHaveBeenCalledWith({
      ctx: expect.anything(),
      flowId: "meta1",
    })
  })

  test("an update failure on a flow still editable keeps the row and creates nothing", async () => {
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))
    m.update.mockRejectedValue(new Error("rate limited"))
    m.get.mockResolvedValue({ id: "meta1", is_used_in_ad: false })

    await syncWelcomeMessageFlows(publish)

    expect(m.svc.markSuperseded).not.toHaveBeenCalled()
    expect(m.svc.deleteByIds).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
    expect(m.svc.insertCurrent).not.toHaveBeenCalled()
    expect(m.warn).toHaveBeenCalled()
  })

  test("an update failure on a flow gone from Meta drops the row and creates a new flow", async () => {
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))
    m.update.mockRejectedValue(new Error("not found"))
    m.get.mockResolvedValue(null)
    m.create.mockResolvedValue({ flowId: "meta2" })

    await syncWelcomeMessageFlows(publish)

    expect(m.svc.replaceCurrent).toHaveBeenCalledWith({
      previous: { id: "row1", action: "delete" },
      next: expect.objectContaining({ metaFlowId: "meta2" }),
    })
    expect(m.svc.deleteByIds).not.toHaveBeenCalled()
    expect(m.svc.markSuperseded).not.toHaveBeenCalled()
  })

  test("a failed lookup after a failed update leaves the row untouched", async () => {
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))
    m.update.mockRejectedValue(new Error("5xx"))
    m.get.mockRejectedValue(new Error("5xx"))

    await syncWelcomeMessageFlows(publish)

    expect(m.svc.markSuperseded).not.toHaveBeenCalled()
    expect(m.svc.deleteByIds).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })

  test("a transient page failure throws after every page ran, so the job retries", async () => {
    m.listByWorkspace.mockResolvedValue([pageA, pageB])
    m.svc.findCurrent.mockResolvedValue(undefined)
    m.create.mockImplementation(
      ({ ctx }: { ctx: { auth: { metadata: { pageId: string } } } }) =>
        ctx.auth.metadata.pageId === "pa"
          ? Promise.reject(new Error("rate limited"))
          : Promise.resolve({ flowId: "metaB" }),
    )
    m.isTransient.mockReturnValue(true)

    await expect(syncWelcomeMessageFlows(publish)).rejects.toBeInstanceOf(
      AggregateError,
    )

    expect(m.svc.insertCurrent).toHaveBeenCalledTimes(1)
    expect(m.svc.insertCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ integrationMessengerId: "ib" }),
    )
  })

  test("zero messages deletes the current Meta flow and creates nothing", async () => {
    m.convert.mockReturnValue({ status: "ok", messages: [] })
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))

    await syncWelcomeMessageFlows(publish)

    expect(m.del).toHaveBeenCalledWith({
      ctx: expect.anything(),
      flowId: "meta1",
    })
    expect(m.svc.deleteByIds).toHaveBeenCalledWith({ ids: ["row1"] })
    expect(m.create).not.toHaveBeenCalled()
  })

  test("zero messages with a failed delete keeps the row as superseded", async () => {
    m.convert.mockReturnValue({ status: "ok", messages: [] })
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))
    m.del.mockRejectedValue(new Error("used in ad"))

    await syncWelcomeMessageFlows(publish)

    expect(m.svc.markSuperseded).toHaveBeenCalledWith({ id: "row1" })
    expect(m.svc.deleteByIds).not.toHaveBeenCalled()
  })

  test("names a restored version by its own number", async () => {
    m.publishedVersionNumber.mockResolvedValue(2)
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))

    await syncWelcomeMessageFlows(publish)

    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Signup (v2)" }),
    )
  })

  test("resolves the version number once for every page", async () => {
    m.listByWorkspace.mockResolvedValue([pageA, pageB])
    m.svc.findCurrent.mockResolvedValue(undefined)
    m.create.mockResolvedValue({ flowId: "meta1" })

    await syncWelcomeMessageFlows(publish)

    expect(m.create).toHaveBeenCalledTimes(2)
    expect(m.publishedVersionNumber).toHaveBeenCalledTimes(1)
  })

  test("nothing to publish skips the version lookup", async () => {
    m.getStartNode.mockResolvedValue({ status: "notPublished" })

    await syncWelcomeMessageFlows(publish)

    expect(m.publishedVersionNumber).not.toHaveBeenCalled()
  })

  test("zero messages skips the version lookup", async () => {
    m.convert.mockReturnValue({ status: "ok", messages: [] })
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))

    await syncWelcomeMessageFlows(publish)

    expect(m.publishedVersionNumber).not.toHaveBeenCalled()
  })

  test("noStartNode is treated as zero messages", async () => {
    m.getStartNode.mockResolvedValue({ status: "noStartNode" })
    m.svc.findCurrent.mockResolvedValue(undefined)

    await syncWelcomeMessageFlows(publish)

    expect(m.convert).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })

  test("a flow deleted after enqueue makes no Graph calls", async () => {
    m.findBy.mockResolvedValue(undefined)

    await syncWelcomeMessageFlows(publish)

    expect(m.listByWorkspace).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
  })

  test("an unpublished flow makes no Graph calls", async () => {
    m.getStartNode.mockResolvedValue({ status: "notPublished" })

    await syncWelcomeMessageFlows(publish)

    expect(m.create).not.toHaveBeenCalled()
    expect(m.del).not.toHaveBeenCalled()
  })

  test("one failing page does not stop the others", async () => {
    m.listByWorkspace.mockResolvedValue([pageA, pageB])
    m.buildContext.mockImplementation(
      ({ integration }: { integration: { id: string; pageId: string } }) =>
        integration.id === "ia"
          ? Promise.reject(new Error("token expired"))
          : Promise.resolve({
              auth: { metadata: { pageId: integration.pageId } },
            }),
    )
    m.svc.findCurrent.mockResolvedValue(undefined)
    m.create.mockResolvedValue({ flowId: "metaB" })

    await expect(syncWelcomeMessageFlows(publish)).resolves.toBeUndefined()

    expect(m.svc.insertCurrent).toHaveBeenCalledTimes(1)
    expect(m.svc.insertCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ integrationMessengerId: "ib" }),
    )
    expect(m.warn).toHaveBeenCalled()
  })
})

describe("syncWelcomeMessageFlows — rename", () => {
  test("updates the name only on pages that already have a row", async () => {
    m.listByWorkspace.mockResolvedValue([pageA, pageB])
    m.svc.findCurrent.mockImplementation(
      async ({ integrationMessengerId }: { integrationMessengerId: string }) =>
        integrationMessengerId === "ia" ? row("row1", "meta1") : undefined,
    )

    await syncWelcomeMessageFlows(rename)

    expect(m.update).toHaveBeenCalledTimes(1)
    expect(m.update).toHaveBeenCalledWith({
      ctx: expect.anything(),
      flowId: "meta1",
      name: "Signup (v3)",
    })
    expect(m.create).not.toHaveBeenCalled()
    expect(m.convert).not.toHaveBeenCalled()
  })

  test("a never-synced flow makes zero Graph calls", async () => {
    m.svc.findCurrent.mockResolvedValue(undefined)

    await syncWelcomeMessageFlows(rename)

    expect(m.update).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
    expect(m.buildContext).not.toHaveBeenCalled()
    expect(m.publishedVersionNumber).not.toHaveBeenCalled()
  })

  test("a failed rename is logged and never falls back to create", async () => {
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))
    m.update.mockRejectedValue(new Error("used in ad"))

    await syncWelcomeMessageFlows(rename)

    expect(m.create).not.toHaveBeenCalled()
    expect(m.svc.markSuperseded).not.toHaveBeenCalled()
    expect(m.warn).toHaveBeenCalled()
  })

  test("a transient rename failure throws so the job retries", async () => {
    m.svc.findCurrent.mockResolvedValue(row("row1", "meta1"))
    m.update.mockRejectedValue(new Error("rate limited"))
    m.isTransient.mockReturnValue(true)

    await expect(syncWelcomeMessageFlows(rename)).rejects.toBeInstanceOf(
      AggregateError,
    )
  })
})

describe("deleteWelcomeMessageFlows", () => {
  test("deletes every row under the flow lock and removes the successful ones", async () => {
    m.svc.listAllByFlow.mockResolvedValue([row("r1", "m1"), row("r2", "m2")])
    m.del.mockImplementation(({ flowId }: { flowId: string }) =>
      flowId === "m2"
        ? Promise.reject(new Error("used in ad"))
        : Promise.resolve(),
    )

    await deleteWelcomeMessageFlows({ workspaceId: "1", flowIds: ["f"] })

    expect(m.lockKeys).toEqual(["welcome-message-flow-f"])
    expect(m.svc.listAllByFlow).toHaveBeenCalledWith({
      workspaceId: "1",
      flowId: "f",
    })
    expect(m.del).toHaveBeenCalledTimes(2)
    expect(m.svc.deleteByIds).toHaveBeenCalledWith({ ids: ["r1"] })
  })

  test("waits long for the flow lock so a slow sync cannot drop the delete", async () => {
    m.svc.listAllByFlow.mockResolvedValue([])

    await deleteWelcomeMessageFlows({ workspaceId: "1", flowIds: ["f"] })

    expect(m.lockOpts[0].retryTimeoutInSeconds).toBeGreaterThanOrEqual(600)
  })

  test("skips rows whose integration is missing or in another workspace", async () => {
    m.svc.listAllByFlow.mockResolvedValue([row("r1", "m1", "ix")])

    await deleteWelcomeMessageFlows({ workspaceId: "1", flowIds: ["f"] })

    expect(m.listByWorkspace).toHaveBeenCalledWith({ workspaceId: "1" })

    expect(m.del).not.toHaveBeenCalled()
    expect(m.svc.deleteByIds).toHaveBeenCalledWith({ ids: [] })
  })
})
