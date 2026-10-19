import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  insertReturning: vi.fn(),
  updateReturning: vi.fn(),
  findMany: vi.fn(),
  findOrFail: vi.fn(),
  findByIds: vi.fn(),
  listBySavedReplyIds: vi.fn(),
  replaceForSavedReply: vi.fn(),
  countBySavedReplyId: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

const updateSet = vi.fn()

const tx = {
  insert: () => ({
    values: () => ({ returning: mocks.insertReturning }),
  }),
  update: () => ({
    set: (values: unknown) => {
      updateSet(values)
      return { where: () => ({ returning: mocks.updateReturning }) }
    },
  }),
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mocks.transaction,
    query: { savedReplyModel: { findMany: mocks.findMany } },
  },
  eq: vi.fn(),
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  mediaLibraryFileRepository: { findByIds: mocks.findByIds },
  savedReplyImageRepository: {
    listBySavedReplyIds: mocks.listBySavedReplyIds,
    replaceForSavedReply: mocks.replaceForSavedReply,
    countBySavedReplyId: mocks.countBySavedReplyId,
  },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(),
}))

const { savedReplyService } = await import("../src/saved-reply/service")

const savedReply = {
  id: "reply-1",
  workspaceId: "ws-1",
  shortcut: "hello",
  text: "Hi",
  createdAt: new Date(),
  updatedAt: new Date(),
}

const imageFile = (id: string, mimeType = "image/png") => ({
  id,
  workspaceId: "ws-1",
  name: `${id}.png`,
  path: `public/space/ws-1/${id}.png`,
  mimeType,
  size: 100,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation((callback) => callback(tx))
  mocks.insertReturning.mockResolvedValue([savedReply])
  mocks.updateReturning.mockResolvedValue([savedReply])
  mocks.findOrFail.mockResolvedValue(savedReply)
  mocks.listBySavedReplyIds.mockResolvedValue([])
  mocks.countBySavedReplyId.mockResolvedValue(0)
  mocks.resolveTenantSettings.mockResolvedValue({
    storageUrl: "https://cdn.test",
  })
})

describe("savedReplyService.create", () => {
  test("stores the images in the given order", async () => {
    mocks.findByIds.mockResolvedValue([imageFile("f2"), imageFile("f1")])

    await savedReplyService.create({
      workspaceId: "ws-1",
      shortcut: "hello",
      text: "Hi",
      imageFileIds: ["f1", "f2"],
    })

    expect(mocks.replaceForSavedReply).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        savedReplyId: "reply-1",
        mediaLibraryFileIds: ["f1", "f2"],
      },
      tx,
    )
  })

  test("accepts images without text", async () => {
    mocks.findByIds.mockResolvedValue([imageFile("f1")])

    await expect(
      savedReplyService.create({
        workspaceId: "ws-1",
        shortcut: "hello",
        text: "",
        imageFileIds: ["f1"],
      }),
    ).resolves.toMatchObject({ id: "reply-1" })
  })

  test("rejects a reply with neither text nor images", async () => {
    await expect(
      savedReplyService.create({
        workspaceId: "ws-1",
        shortcut: "hello",
        text: "  ",
      }),
    ).rejects.toMatchObject({ field: "text" })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("rejects a PDF", async () => {
    mocks.findByIds.mockResolvedValue([imageFile("f1", "application/pdf")])

    await expect(
      savedReplyService.create({
        workspaceId: "ws-1",
        shortcut: "hello",
        text: "Hi",
        imageFileIds: ["f1"],
      }),
    ).rejects.toMatchObject({ field: "imageFileIds" })
  })

  test("rejects a video", async () => {
    mocks.findByIds.mockResolvedValue([imageFile("f1", "video/mp4")])

    await expect(
      savedReplyService.create({
        workspaceId: "ws-1",
        shortcut: "hello",
        text: "Hi",
        imageFileIds: ["f1"],
      }),
    ).rejects.toMatchObject({ field: "imageFileIds" })
  })

  test("rejects a file from another workspace", async () => {
    mocks.findByIds.mockResolvedValue([])

    await expect(
      savedReplyService.create({
        workspaceId: "ws-1",
        shortcut: "hello",
        text: "Hi",
        imageFileIds: ["other"],
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("savedReplyService.update", () => {
  test("keeps the current images when imageFileIds is omitted", async () => {
    await savedReplyService.update(
      { workspaceId: "ws-1", id: "reply-1" },
      { shortcut: "hello", text: "Hi again" },
    )

    expect(mocks.replaceForSavedReply).not.toHaveBeenCalled()
  })

  test("renames an image-only reply without resending its images", async () => {
    mocks.findOrFail.mockResolvedValue({ ...savedReply, text: "" })
    mocks.countBySavedReplyId.mockResolvedValue(3)

    await savedReplyService.update(
      { workspaceId: "ws-1", id: "reply-1" },
      { shortcut: "renamed" },
    )

    expect(updateSet).toHaveBeenCalledWith({ shortcut: "renamed", text: "" })
    expect(mocks.replaceForSavedReply).not.toHaveBeenCalled()
  })

  test("keeps the current text when only images are sent", async () => {
    mocks.findByIds.mockResolvedValue([imageFile("f1")])

    await savedReplyService.update(
      { workspaceId: "ws-1", id: "reply-1" },
      { shortcut: "hello", imageFileIds: ["f1"] },
    )

    expect(updateSet).toHaveBeenCalledWith({ shortcut: "hello", text: "Hi" })
  })

  test("rejects an update that leaves neither text nor images", async () => {
    await expect(
      savedReplyService.update(
        { workspaceId: "ws-1", id: "reply-1" },
        { shortcut: "hello", text: "", imageFileIds: [] },
      ),
    ).rejects.toMatchObject({ field: "text" })
  })

  test("reads the images once for the returned reply", async () => {
    await savedReplyService.update(
      { workspaceId: "ws-1", id: "reply-1" },
      { shortcut: "hello", text: "Hi again" },
    )

    expect(mocks.listBySavedReplyIds).toHaveBeenCalledTimes(1)
  })

  test("clears the images with an empty list when text remains", async () => {
    await savedReplyService.update(
      { workspaceId: "ws-1", id: "reply-1" },
      { shortcut: "hello", text: "Hi", imageFileIds: [] },
    )

    expect(mocks.replaceForSavedReply).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        savedReplyId: "reply-1",
        mediaLibraryFileIds: [],
      },
      tx,
    )
  })
})

describe("savedReplyService.listByWorkspaceId", () => {
  test("returns each reply with its images and public urls", async () => {
    mocks.findMany.mockResolvedValue([savedReply])
    mocks.listBySavedReplyIds.mockResolvedValue([
      {
        id: "img-1",
        savedReplyId: "reply-1",
        mediaLibraryFileId: "f1",
        position: 0,
        file: {
          name: "f1.png",
          path: "public/space/ws-1/f1.png",
          mimeType: "image/png",
          size: 100,
        },
      },
    ])

    const [result] = await savedReplyService.listByWorkspaceId("ws-1")

    expect(result.images).toEqual([
      {
        id: "img-1",
        mediaLibraryFileId: "f1",
        name: "f1.png",
        mimeType: "image/png",
        size: 100,
        url: expect.stringContaining("public/space/ws-1/f1.png"),
      },
    ])
  })
})
