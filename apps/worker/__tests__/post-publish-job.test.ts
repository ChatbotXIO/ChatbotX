import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  runFeed: vi.fn(),
  runPartCheck: vi.fn(),
  runPart: vi.fn(),
  runRemoval: vi.fn(),
  runTarget: vi.fn(),
  runTargetCheck: vi.fn(),
  withBlockedOwnerGuard: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  socialPostFeedRunner: { runFeed: mocks.runFeed },
  socialPostPartPublishService: {
    runPart: mocks.runPart,
    runPartCheck: mocks.runPartCheck,
  },
  socialPostPublishService: {
    runTarget: mocks.runTarget,
    runTargetCheck: mocks.runTargetCheck,
  },
  socialPostRemoveService: { runRemoval: mocks.runRemoval },
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
}))
vi.mock("../src/lib/logger", () => ({ logger: { info: mocks.info } }))
vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: async (_ctx: unknown, run: () => Promise<unknown>) =>
    await run(),
}))
vi.mock("../src/post-publish/publishers", () => ({
  socialPublishers: { facebook: "fb" },
}))

const { processPostPublishJob } = await import(
  "../src/post-publish/process-job"
)

const job = {
  data: { socialPostTargetId: "t-1", workspaceId: "ws-1" },
  type: "publishTarget",
} as const

describe("processPostPublishJob", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test("runs the target with the registered publishers inside the owner guard", async () => {
    mocks.withBlockedOwnerGuard.mockImplementation(
      async (_id: string, run: () => Promise<unknown>) => await run(),
    )

    await processPostPublishJob(job)

    expect(mocks.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
    expect(mocks.runTarget).toHaveBeenCalledWith(
      { id: "t-1", workspaceId: "ws-1" },
      { facebook: "fb" },
    )
  })

  test("a blocked owner is a bare return: nothing runs", async () => {
    mocks.withBlockedOwnerGuard.mockResolvedValue(undefined)

    await processPostPublishJob(job)

    expect(mocks.runTarget).not.toHaveBeenCalled()
  })

  test("a removal job takes the post down through the remove service, not the publisher", async () => {
    mocks.withBlockedOwnerGuard.mockImplementation(
      async (_id: string, run: () => Promise<unknown>) => await run(),
    )

    await processPostPublishJob({
      data: { socialPostTargetId: "t-1", workspaceId: "ws-1" },
      type: "removeTarget",
    })

    expect(mocks.runRemoval).toHaveBeenCalledWith(
      { id: "t-1", workspaceId: "ws-1" },
      { facebook: "fb" },
    )
    expect(mocks.runTarget).not.toHaveBeenCalled()
  })

  test("a blocked workspace's removal job is a bare return", async () => {
    mocks.withBlockedOwnerGuard.mockResolvedValue(undefined)

    await processPostPublishJob({
      data: { socialPostTargetId: "t-1", workspaceId: "ws-1" },
      type: "removeTarget",
    })

    expect(mocks.runRemoval).not.toHaveBeenCalled()
  })

  test("a part job runs that part, inside the owner guard, never the target", async () => {
    mocks.withBlockedOwnerGuard.mockImplementation(
      async (_id: string, run: () => Promise<unknown>) => await run(),
    )

    await processPostPublishJob({
      data: { socialPostPartId: "part-1", workspaceId: "ws-1" },
      type: "publishPart",
    })

    expect(mocks.runPart).toHaveBeenCalledWith(
      { id: "part-1", workspaceId: "ws-1" },
      { facebook: "fb" },
    )
    expect(mocks.runTarget).not.toHaveBeenCalled()
  })

  test("a target check job reads that claim through the check path, inside the owner guard", async () => {
    mocks.withBlockedOwnerGuard.mockImplementation(
      async (_id: string, run: () => Promise<unknown>) => await run(),
    )

    await processPostPublishJob({
      data: {
        leaseUntilMs: 1000,
        socialPostTargetId: "t-1",
        workspaceId: "ws-1",
      },
      type: "checkTarget",
    })

    expect(mocks.runTargetCheck).toHaveBeenCalledWith(
      { id: "t-1", leaseUntil: new Date(1000), workspaceId: "ws-1" },
      { facebook: "fb" },
    )
    expect(mocks.runTarget).not.toHaveBeenCalled()
  })

  test("a part check job reads that claim, and a blocked owner's check is a bare return", async () => {
    mocks.withBlockedOwnerGuard.mockImplementationOnce(
      async (_id: string, run: () => Promise<unknown>) => await run(),
    )
    await processPostPublishJob({
      data: {
        leaseUntilMs: 1000,
        socialPostPartId: "p-1",
        workspaceId: "ws-1",
      },
      type: "checkPart",
    })
    expect(mocks.runPartCheck).toHaveBeenCalledWith(
      { id: "p-1", leaseUntil: new Date(1000), workspaceId: "ws-1" },
      { facebook: "fb" },
    )

    mocks.withBlockedOwnerGuard.mockResolvedValue(undefined)
    await processPostPublishJob({
      data: {
        leaseUntilMs: 1000,
        socialPostTargetId: "t-1",
        workspaceId: "ws-1",
      },
      type: "checkTarget",
    })
    expect(mocks.runTargetCheck).not.toHaveBeenCalled()
  })

  test("a feed job logs what the check did", async () => {
    mocks.withBlockedOwnerGuard.mockImplementation(
      async (_id: string, run: () => Promise<unknown>) => await run(),
    )
    mocks.runFeed.mockResolvedValue({ kind: "stale", retries: 1 })

    await processPostPublishJob({
      data: { feedId: "f-1", workspaceId: "ws-1" },
      type: "runFeed",
    } as never)

    expect(mocks.runFeed).toHaveBeenCalledWith({
      id: "f-1",
      workspaceId: "ws-1",
    })
    expect(mocks.info).toHaveBeenCalledWith(
      {
        feedId: "f-1",
        result: { kind: "stale", retries: 1 },
        workspaceId: "ws-1",
      },
      "post-publish: feed job finished",
    )
  })
})
