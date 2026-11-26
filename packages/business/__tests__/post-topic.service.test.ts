import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countByWorkspace: vi.fn(),
  delete: vi.fn(),
  insert: vi.fn(),
  isUniqueViolationError: vi.fn(() => false),
  list: vi.fn(),
  lockWorkspaceTopics: vi.fn(),
  update: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
  isUniqueViolationError: mocks.isUniqueViolationError,
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  postTopicRepository: {
    countByWorkspace: mocks.countByWorkspace,
    delete: mocks.delete,
    insert: mocks.insert,
    list: mocks.list,
    lockWorkspaceTopics: mocks.lockWorkspaceTopics,
    update: mocks.update,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))

const { MAX_POST_TOPICS_PER_WORKSPACE, postTopicService } = await import(
  "../src/post-topic/service"
)

describe("postTopicService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.countByWorkspace.mockResolvedValue(0)
  })

  test("lists at most the workspace cap", async () => {
    mocks.list.mockResolvedValue([])

    await postTopicService.list({ search: "sa", workspaceId: "ws-1" })

    expect(mocks.list).toHaveBeenCalledWith({
      limit: MAX_POST_TOPICS_PER_WORKSPACE,
      search: "sa",
      workspaceId: "ws-1",
    })
  })

  test("creates a topic with no color as null", async () => {
    mocks.insert.mockResolvedValue({ color: null, id: "1", name: "Sale" })

    await postTopicService.create({ name: "Sale", workspaceId: "ws-1" })

    expect(mocks.insert).toHaveBeenCalledWith(
      { color: null, name: "Sale", workspaceId: "ws-1" },
      tx,
    )
  })

  test("takes the workspace lock before counting and inserting", async () => {
    const order: string[] = []
    mocks.lockWorkspaceTopics.mockImplementation(() => {
      order.push("lock")
      return Promise.resolve()
    })
    mocks.countByWorkspace.mockImplementation(() => {
      order.push("count")
      return Promise.resolve(0)
    })
    mocks.insert.mockImplementation(() => {
      order.push("insert")
      return Promise.resolve({ color: null, id: "1", name: "Sale" })
    })

    await postTopicService.create({ name: "Sale", workspaceId: "ws-1" })

    expect(order).toEqual(["lock", "count", "insert"])
    expect(mocks.lockWorkspaceTopics).toHaveBeenCalledWith("ws-1", tx)
  })

  test("a taken name is a 409 topicNameTaken", async () => {
    mocks.insert.mockResolvedValue(null)

    await expect(
      postTopicService.create({ name: "Sale", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "topicNameTaken", httpStatusCode: 409 })
  })

  test("refuses a new topic past the workspace cap", async () => {
    mocks.countByWorkspace.mockResolvedValue(MAX_POST_TOPICS_PER_WORKSPACE)

    await expect(
      postTopicService.create({ name: "Sale", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("update of a missing topic is not found", async () => {
    mocks.update.mockResolvedValue(null)

    await expect(
      postTopicService.update({ id: "9", name: "New", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("renaming onto an existing name is a 409 topicNameTaken", async () => {
    mocks.isUniqueViolationError.mockReturnValueOnce(true)
    mocks.update.mockRejectedValue(new Error("duplicate key"))

    await expect(
      postTopicService.update({ id: "9", name: "Sale", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "topicNameTaken", httpStatusCode: 409 })
    expect(mocks.isUniqueViolationError).toHaveBeenCalledWith(
      expect.any(Error),
      "PostTopic_workspaceId_name_key",
    )
  })

  test("rethrows any other database failure", async () => {
    const failure = new Error("connection lost")
    mocks.update.mockRejectedValue(failure)

    await expect(
      postTopicService.update({ id: "9", name: "Sale", workspaceId: "ws-1" }),
    ).rejects.toBe(failure)
  })

  test("delete of a missing topic is not found", async () => {
    mocks.delete.mockResolvedValue(false)

    await expect(
      postTopicService.delete({ id: "9", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("deletes within the workspace", async () => {
    mocks.delete.mockResolvedValue(true)

    await postTopicService.delete({ id: "9", workspaceId: "ws-1" })

    expect(mocks.delete).toHaveBeenCalledWith({ id: "9", workspaceId: "ws-1" })
  })
})
