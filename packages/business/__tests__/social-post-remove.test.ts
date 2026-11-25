import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  enqueue: vi.fn(),
  findForRemoval: vi.fn(),
  findForWorkspace: vi.fn(),
  loadCredentials: vi.fn(),
  listForPost: vi.fn(),
  markChannelPostRemoved: vi.fn(),
  recordAuth: vi.fn(),
  markRemoved: vi.fn(),
  recordFailure: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostManagementRepository: {
    markRemoved: mocks.markChannelPostRemoved,
  },
  socialPostRemovalRepository: {
    findForRemoval: mocks.findForRemoval,
    listForPost: mocks.listForPost,
    markRemoved: mocks.markRemoved,
    recordFailure: mocks.recordFailure,
  },
  socialPostRepository: { findForWorkspace: mocks.findForWorkspace },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  PostPublishJobAction: { removeTarget: "removeTarget" },
  postPublishQueue: { add: mocks.enqueue },
  postRemoveJobId: (id: string) => `social-post-remove-${id}`,
}))
vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/publish-destination/credentials", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/publish-destination/credentials")
  >()),
  loadPublishCredentials: mocks.loadCredentials,
  recordPublishAuthFailure: mocks.recordAuth,
}))
vi.mock("../src/social-post/notify", () => ({
  emitSocialPostChanged: mocks.emit,
}))

const { socialPostRemoveService } = await import(
  "../src/social-post/remove.service"
)

const WS = "ws-1"
const TOKEN = "EAAB-page-token"

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "t-1",
  provider: "facebook",
  publisherKey: "facebook",
  removedAt: null,
  status: "published",
  ...overrides,
})

const credentials = (publisherKey = "facebook") => ({
  credentials: {
    accessToken: TOKEN,
    destinationExternalId: "page-1",
    fence: {
      grantedScopes: null,
      integrationId: "g-1",
      integrationTable: "IntegrationMessenger",
      kind: "inbox",
      provider: "facebook",
      publishDestinationId: "dest-1",
      tokenFingerprint: "abc",
    },
    publisherKey,
  },
  ok: true,
})

const removal = (overrides: Record<string, unknown> = {}) => ({
  accountId: null,
  accountStatus: null,
  channelPostId: null,
  destinationId: "dest-1",
  externalPostId: "page_99",
  id: "t-1",
  provider: "facebook",
  removedAt: null,
  socialPostId: "p-1",
  status: "published",
  workspaceId: WS,
  ...overrides,
})

const publisher = () => ({
  checkStatus: vi.fn(),
  delete: vi.fn(),
  publish: vi.fn(),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findForWorkspace.mockResolvedValue({ id: "p-1" })
  mocks.loadCredentials.mockResolvedValue(credentials())
  mocks.markRemoved.mockResolvedValue({ channelPostId: null })
})

describe("socialPostRemoveService.request", () => {
  test("queues one job per published, supported, not removed target", async () => {
    mocks.listForPost.mockResolvedValue([
      row({ id: "t-1" }),
      row({ id: "t-2", provider: "threads", publisherKey: "threads" }),
    ])
    const result = await socialPostRemoveService.request({
      id: "p-1",
      workspaceId: WS,
    })
    expect(result.targets).toEqual([
      { status: "queued", targetId: "t-1" },
      { status: "queued", targetId: "t-2" },
    ])
    expect(mocks.enqueue).toHaveBeenCalledTimes(2)
    expect(mocks.enqueue.mock.calls[0]?.[2]).toEqual({
      jobId: "social-post-remove-t-1",
    })
  })

  test("a network without a delete is reported unsupported and gets no job", async () => {
    mocks.listForPost.mockResolvedValue([
      row({ id: "t-1", provider: "tiktok", publisherKey: "tiktok" }),
      row({ id: "t-2" }),
    ])
    const result = await socialPostRemoveService.request({
      id: "p-1",
      workspaceId: WS,
    })
    expect(result.targets).toEqual([
      { status: "unsupported", targetId: "t-1" },
      { status: "queued", targetId: "t-2" },
    ])
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
  })

  test("an Instagram Login target is reported unsupported at once", async () => {
    mocks.listForPost.mockResolvedValue([
      row({ id: "t-1", provider: "instagram", publisherKey: "instagram" }),
      row({ id: "t-2" }),
    ])
    const result = await socialPostRemoveService.request({
      id: "p-1",
      workspaceId: WS,
    })
    expect(result.targets).toEqual([
      { status: "unsupported", targetId: "t-1" },
      { status: "queued", targetId: "t-2" },
    ])
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
  })

  test("a Facebook Login Instagram target is queued", async () => {
    mocks.listForPost.mockResolvedValue([
      row({
        id: "t-1",
        provider: "instagram",
        publisherKey: "instagramFacebook",
      }),
    ])
    const result = await socialPostRemoveService.request({
      id: "p-1",
      workspaceId: WS,
    })
    expect(result.targets).toEqual([{ status: "queued", targetId: "t-1" }])
  })

  test("removing an already removed post is idempotent: nothing is queued", async () => {
    mocks.listForPost.mockResolvedValue([
      row({ removedAt: new Date("2026-01-01T00:00:00Z") }),
    ])
    const result = await socialPostRemoveService.request({
      id: "p-1",
      workspaceId: WS,
    })
    expect(result.targets).toEqual([{ status: "removed", targetId: "t-1" }])
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("a target that is not published is left alone", async () => {
    mocks.listForPost.mockResolvedValue([
      row({ id: "t-1", status: "pending" }),
      row({ id: "t-2" }),
    ])
    const result = await socialPostRemoveService.request({
      id: "p-1",
      workspaceId: WS,
    })
    expect(result.targets[0]).toEqual({
      status: "notPublished",
      targetId: "t-1",
    })
    expect(mocks.enqueue).toHaveBeenCalledTimes(1)
  })

  test("a post with nothing published answers 409", async () => {
    mocks.listForPost.mockResolvedValue([row({ status: "draft" })])
    await expect(
      socialPostRemoveService.request({ id: "p-1", workspaceId: WS }),
    ).rejects.toMatchObject({ code: "socialPostNotRemovable" })
  })

  test("an unknown post answers not found", async () => {
    mocks.findForWorkspace.mockResolvedValue(null)
    await expect(
      socialPostRemoveService.request({ id: "p-1", workspaceId: WS }),
    ).rejects.toThrow("Post not found")
  })
})

describe("socialPostRemoveService.runRemoval", () => {
  test("a confirmed delete marks the target and the linked channel post", async () => {
    mocks.findForRemoval.mockResolvedValue(removal({ channelPostId: "cp-1" }))
    mocks.markRemoved.mockResolvedValue({ channelPostId: "cp-1" })
    const fake = publisher()
    fake.delete.mockResolvedValue({ deleted: true })
    const result = await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(result).toBe("removed")
    expect(fake.delete).toHaveBeenCalledWith({
      accessToken: TOKEN,
      externalPostId: "page_99",
    })
    expect(mocks.markChannelPostRemoved).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cp-1", workspaceId: WS }),
    )
    expect(mocks.emit).toHaveBeenCalled()
  })

  test("a target already removed or not published makes no network call", async () => {
    const fake = publisher()
    mocks.findForRemoval.mockResolvedValue(
      removal({ removedAt: new Date("2026-01-01T00:00:00Z") }),
    )
    expect(
      await socialPostRemoveService.runRemoval(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      ),
    ).toBe("skipped")
    mocks.findForRemoval.mockResolvedValue(removal({ status: "failed" }))
    expect(
      await socialPostRemoveService.runRemoval(
        { id: "t-1", workspaceId: WS },
        { facebook: fake },
      ),
    ).toBe("skipped")
    expect(fake.delete).not.toHaveBeenCalled()
  })

  test("a not-found answer counts as removed (a repeat after a crashed run)", async () => {
    mocks.findForRemoval.mockResolvedValue(removal())
    mocks.markRemoved.mockResolvedValue({ channelPostId: null })
    const fake = publisher()
    fake.delete.mockResolvedValue({
      category: "notFound",
      code: "graph_803",
      message: "does not exist",
      provablyNotCreated: true,
      status: "failed",
    })
    const result = await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(result).toBe("removed")
    expect(mocks.markRemoved).toHaveBeenCalled()
    expect(mocks.recordFailure).not.toHaveBeenCalled()
  })

  test("a refusal is recorded in the error fields and the target stays published", async () => {
    mocks.findForRemoval.mockResolvedValue(removal())
    const fake = publisher()
    fake.delete.mockResolvedValue({
      category: "rateLimited",
      code: "graph_4",
      message: "slow down",
      status: "failed",
    })
    const result = await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(result).toBe("failed")
    expect(mocks.markRemoved).not.toHaveBeenCalled()
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          category: "rateLimited",
          code: "graph_4",
        }),
      }),
    )
  })

  test("a rejected token is recorded against the destination's credential", async () => {
    mocks.findForRemoval.mockResolvedValue(removal())
    const fake = publisher()
    fake.delete.mockResolvedValue({
      category: "authFailed",
      code: "graph_190",
      message: "bad",
      provablyNotCreated: true,
      status: "failed",
    })
    await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(mocks.recordAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "authFailed",
        workspaceId: WS,
      }),
    )
  })

  test("the unsupported code of a network without delete is recorded as removalUnsupported", async () => {
    mocks.findForRemoval.mockResolvedValue(removal({ provider: "instagram" }))
    mocks.loadCredentials.mockResolvedValue(credentials("instagram"))
    const fake = publisher()
    fake.delete.mockResolvedValue({
      category: "payloadInvalid",
      code: "delete_unsupported",
      message: "no",
      provablyNotCreated: true,
      status: "failed",
    })
    await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { instagram: fake },
    )
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "removalUnsupported" }),
      }),
    )
  })

  test("Threads refusing the delete for a missing permission is recorded as removalPermissionMissing", async () => {
    mocks.findForRemoval.mockResolvedValue(removal({ provider: "threads" }))
    mocks.loadCredentials.mockResolvedValue(credentials("threads"))
    const fake = publisher()
    fake.delete.mockResolvedValue({
      category: "permissionDenied",
      code: "graph_10",
      message: "denied",
      provablyNotCreated: true,
      status: "failed",
    })
    await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { threads: fake },
    )
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "removalPermissionMissing" }),
      }),
    )
  })

  test("Instagram through Facebook Login refusing the delete for a missing permission is recorded as removalPermissionMissing", async () => {
    mocks.findForRemoval.mockResolvedValue(removal({ provider: "instagram" }))
    mocks.loadCredentials.mockResolvedValue(credentials("instagramFacebook"))
    const fake = publisher()
    fake.delete.mockResolvedValue({
      category: "permissionDenied",
      code: "graph_10",
      message: "denied",
      provablyNotCreated: true,
      status: "failed",
    })
    await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { instagramFacebook: fake },
    )
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "removalPermissionMissing" }),
      }),
    )
  })

  test("Instagram Login permission errors keep their own code", async () => {
    mocks.findForRemoval.mockResolvedValue(removal({ provider: "instagram" }))
    mocks.loadCredentials.mockResolvedValue(credentials("instagram"))
    const fake = publisher()
    fake.delete.mockResolvedValue({
      category: "permissionDenied",
      code: "graph_10",
      message: "denied",
      provablyNotCreated: true,
      status: "failed",
    })
    await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { instagram: fake },
    )
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "graph_10" }),
      }),
    )
  })

  test("another network's permission error keeps its own code", async () => {
    mocks.findForRemoval.mockResolvedValue(removal())
    mocks.loadCredentials.mockResolvedValue(credentials("facebook"))
    const fake = publisher()
    fake.delete.mockResolvedValue({
      category: "permissionDenied",
      code: "graph_200",
      message: "denied",
      provablyNotCreated: true,
      status: "failed",
    })
    await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "graph_200" }),
      }),
    )
  })

  test("a destination that needs a reconnect is recorded without a network call, and a crash never leaks the token", async () => {
    const fake = publisher()
    mocks.loadCredentials.mockResolvedValueOnce({
      blocker: {
        category: "authFailed",
        code: "inboxNeedsReconnect",
        message: "m",
        provablyNotCreated: true,
        status: "failed",
      },
      ok: false,
    })
    mocks.findForRemoval.mockResolvedValue(removal())
    await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(fake.delete).not.toHaveBeenCalled()
    expect(mocks.recordFailure).toHaveBeenCalledTimes(1)

    mocks.findForRemoval.mockResolvedValue(removal())
    fake.delete.mockRejectedValue(new Error(`boom ${TOKEN}`))
    const result = await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { facebook: fake },
    )
    expect(result).toBe("failed")
    expect(JSON.stringify(mocks.recordFailure.mock.calls)).not.toContain(TOKEN)
  })
})

describe("the delete quota", () => {
  test("a removal over the network's delete quota is refused without a call and says why", async () => {
    mocks.findForRemoval.mockResolvedValue(removal({ provider: "threads" }))
    mocks.loadCredentials.mockResolvedValue(credentials("threads"))
    const fake = {
      ...publisher(),
      getDeleteLimit: vi.fn(async () => ({ quotaTotal: 100, quotaUsage: 100 })),
    }

    const result = await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { threads: fake } as never,
    )

    expect(result).toBe("failed")
    expect(fake.delete).not.toHaveBeenCalled()
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "removalQuotaExhausted" }),
      }),
    )
  })

  test("a removal with room in the quota still deletes", async () => {
    mocks.findForRemoval.mockResolvedValue(removal({ provider: "threads" }))
    mocks.loadCredentials.mockResolvedValue(credentials("threads"))
    const fake = {
      ...publisher(),
      getDeleteLimit: vi.fn(async () => ({ quotaTotal: 100, quotaUsage: 5 })),
    }
    fake.delete.mockResolvedValue({ deleted: true })

    const result = await socialPostRemoveService.runRemoval(
      { id: "t-1", workspaceId: WS },
      { threads: fake } as never,
    )

    expect(result).toBe("removed")
    expect(fake.delete).toHaveBeenCalledTimes(1)
  })
})
