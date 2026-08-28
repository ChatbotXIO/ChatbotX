import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByWorkspace: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  assertDeletable: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  savedReplyRepository: {
    listByWorkspace: mocks.listByWorkspace,
    findById: mocks.findById,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
  },
}))

vi.mock("../../template/installed-resource.service", () => ({
  assertDeletable: mocks.assertDeletable,
}))

const { savedReplyService } = await import("../service")

const WS = "ws-test-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("SavedReplyService.list", () => {
  test("delegates to the repository", async () => {
    const rows = [
      { id: "reply-1", shortcut: "/a", text: "A", workspaceId: WS },
      { id: "reply-2", shortcut: "/b", text: "B", workspaceId: WS },
    ]
    mocks.listByWorkspace.mockResolvedValueOnce(rows)

    const result = await savedReplyService.list({ workspaceId: WS })

    expect(mocks.listByWorkspace).toHaveBeenCalledWith({ workspaceId: WS })
    expect(result).toEqual(rows)
  })
})

describe("SavedReplyService.create", () => {
  test("delegates to the repository", async () => {
    const created = {
      id: "generated-id",
      shortcut: "/hi",
      text: "Hello",
      workspaceId: WS,
    }
    mocks.create.mockResolvedValueOnce(created)

    const result = await savedReplyService.create({
      workspaceId: WS,
      data: { shortcut: "/hi", text: "Hello" },
    })

    expect(mocks.create).toHaveBeenCalledWith(
      { workspaceId: WS, data: { shortcut: "/hi", text: "Hello" } },
      expect.anything(),
    )
    expect(result).toEqual(created)
  })
})

describe("SavedReplyService.update", () => {
  test("throws notFound when the repository returns undefined", async () => {
    mocks.update.mockResolvedValueOnce(undefined)

    await expect(
      savedReplyService.update({
        workspaceId: WS,
        id: "missing",
        data: { shortcut: "/x", text: "y" },
      }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })
  })

  test("returns the updated row on success", async () => {
    const updated = {
      id: "reply-1",
      shortcut: "/new",
      text: "Updated",
      workspaceId: WS,
    }
    mocks.update.mockResolvedValueOnce(updated)

    const result = await savedReplyService.update({
      workspaceId: WS,
      id: "reply-1",
      data: { shortcut: "/new", text: "Updated" },
    })

    expect(mocks.update).toHaveBeenCalledWith(
      {
        id: "reply-1",
        workspaceId: WS,
        data: { shortcut: "/new", text: "Updated" },
      },
      expect.anything(),
    )
    expect(result).toEqual(updated)
  })
})

describe("SavedReplyService.delete", () => {
  test("throws notFound when the reply does not exist", async () => {
    mocks.findById.mockResolvedValueOnce(undefined)

    await expect(
      savedReplyService.delete({ workspaceId: WS, id: "missing" }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })

    expect(mocks.assertDeletable).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  test("checks deletability before deleting", async () => {
    mocks.findById.mockResolvedValueOnce({ id: "reply-1" })

    await savedReplyService.delete({ workspaceId: WS, id: "reply-1" })

    expect(mocks.assertDeletable).toHaveBeenCalledWith({
      workspaceId: WS,
      resourceKind: "savedReply",
      resourceIds: ["reply-1"],
    })
    expect(mocks.delete).toHaveBeenCalledTimes(1)
  })

  test("does not delete when assertDeletable rejects", async () => {
    mocks.findById.mockResolvedValueOnce({ id: "reply-1" })
    mocks.assertDeletable.mockRejectedValueOnce(new Error("in use"))

    await expect(
      savedReplyService.delete({ workspaceId: WS, id: "reply-1" }),
    ).rejects.toThrow("in use")

    expect(mocks.delete).not.toHaveBeenCalled()
  })
})
