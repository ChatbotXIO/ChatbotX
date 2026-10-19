// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreate,
  mockCreateId,
  mockCopyObject,
  mockCreateFile,
  mockReplaceImages,
  mockListImages,
  mockSavedReplyFindMany,
  mockBotFieldFindMany,
  mockInsertReturning,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockCreateId: vi.fn(),
  mockCopyObject: vi.fn(),
  mockCreateFile: vi.fn(),
  mockReplaceImages: vi.fn(),
  mockListImages: vi.fn(),
  mockSavedReplyFindMany: vi.fn(),
  mockBotFieldFindMany: vi.fn(),
  mockInsertReturning: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      savedReplyModel: { findMany: mockSavedReplyFindMany },
      botFieldModel: { findMany: mockBotFieldFindMany },
    },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  mediaLibraryFileRepository: { create: mockCreateFile },
  savedReplyImageRepository: {
    replaceForSavedReply: mockReplaceImages,
    listBySavedReplyIds: mockListImages,
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { copyObject: mockCopyObject },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  savedReplyModel: { table: "SavedReply" },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: mockCreateId,
}))

vi.mock("../src/bot-field/service", () => ({
  botFieldService: { create: mockCreate },
}))

const buildContext = (idMaps: Record<string, Map<string, string>> = {}) => ({
  tx: {} as never,
  workspaceId: "ws-1",
  installationId: "install-1",
  idMaps,
  track: vi.fn(),
  warn: vi.fn(),
})

const { settingsAdapter } = await import("../src/template/adapters/settings")

describe("settingsAdapter", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("declares botField as a provided kind", () => {
    expect(settingsAdapter.providesKinds).toContain("botField")
  })

  test("populates ctx.idMaps.botField (sourceId -> createdId) when a bot field is created", async () => {
    mockCreate.mockResolvedValue({ id: "created-bot-field-id" })
    const ctx = buildContext()

    await settingsAdapter.insert(ctx, [
      {
        sourceId: "src-bot-field",
        kind: "botField",
        name: "Loyalty Points",
        type: "number",
        value: "42",
        description: null,
        folderId: null,
      },
    ])

    expect(ctx.idMaps.botField).toBeInstanceOf(Map)
    expect(ctx.idMaps.botField?.get("src-bot-field")).toBe(
      "created-bot-field-id",
    )
    expect(ctx.track).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "settings",
        resourceKind: "botField",
        resourceId: "created-bot-field-id",
        sourceResourceId: "src-bot-field",
        wasExisting: false,
      }),
    )
  })

  test("populates idMaps.botField for every bot field entry in a batch, keyed by sourceId", async () => {
    mockCreate
      .mockResolvedValueOnce({ id: "created-1" })
      .mockResolvedValueOnce({ id: "created-2" })
    const ctx = buildContext()

    await settingsAdapter.insert(ctx, [
      {
        sourceId: "src-1",
        kind: "botField",
        name: "Alpha",
        type: "shortText",
        value: null,
        description: null,
        folderId: null,
      },
      {
        sourceId: "src-2",
        kind: "botField",
        name: "Beta",
        type: "shortText",
        value: null,
        description: null,
        folderId: null,
      },
    ])

    expect(ctx.idMaps.botField?.get("src-1")).toBe("created-1")
    expect(ctx.idMaps.botField?.get("src-2")).toBe("created-2")
  })

  test("resolves a bot field's folder reference against idMaps.folder", async () => {
    mockCreate.mockResolvedValue({ id: "created-bot-field-id" })
    const ctx = buildContext({
      folder: new Map([["src-folder", "target-folder"]]),
    })

    await settingsAdapter.insert(ctx, [
      {
        sourceId: "src-bot-field",
        kind: "botField",
        name: "Loyalty Points",
        type: "number",
        value: "42",
        description: null,
        folderId: "src-folder",
      },
    ])

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ folderId: "target-folder" }),
      }),
    )
  })

  test("warns and nulls the folder reference when the folder never resolved", async () => {
    mockCreate.mockResolvedValue({ id: "created-bot-field-id" })
    const ctx = buildContext()

    await settingsAdapter.insert(ctx, [
      {
        sourceId: "src-bot-field",
        kind: "botField",
        name: "Loyalty Points",
        type: "number",
        value: "42",
        description: null,
        folderId: "src-missing-folder",
      },
    ])

    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityKind: "folder",
        value: "src-missing-folder",
      }),
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ folderId: null }),
      }),
    )
  })
})

describe("settingsAdapter saved reply images", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const buildTxContext = () => ({
    ...buildContext(),
    trackCopiedObject: vi.fn(),
    tx: {
      insert: () => ({
        values: () => ({ returning: mockInsertReturning }),
      }),
    } as never,
  })

  const image = (path: string) => ({
    path,
    name: "a.png",
    mimeType: "image/png",
    size: 10,
  })

  test("exports each saved reply's images in order", async () => {
    mockSavedReplyFindMany.mockResolvedValue([
      { id: "reply-1", shortcut: "sp", text: "Hi" },
    ])
    mockBotFieldFindMany.mockResolvedValue([])
    mockListImages.mockResolvedValue([
      {
        id: "img-1",
        savedReplyId: "reply-1",
        mediaLibraryFileId: "f1",
        position: 0,
        file: {
          path: "public/space/1/media-library/a",
          name: "a.png",
          mimeType: "image/png",
          size: 10,
        },
      },
    ])

    const result = await settingsAdapter.collector?.collect("1", ["reply-1"])

    expect(result?.entries[0]).toMatchObject({
      kind: "savedReply",
      images: [image("public/space/1/media-library/a")],
    })
  })

  test("copies the images into the installing workspace's media library", async () => {
    mockCreateId.mockReturnValue("new-id")
    mockInsertReturning.mockResolvedValue([{ id: "created-reply" }])
    mockCreateFile.mockResolvedValue({ id: "new-file" })
    const ctx = buildTxContext()

    await settingsAdapter.insert(ctx, [
      {
        sourceId: "reply-1",
        kind: "savedReply",
        shortcut: "sp",
        text: "Hi",
        images: [image("public/space/1/media-library/a")],
      },
    ])

    expect(mockCopyObject).toHaveBeenCalledWith(
      "public/space/1/media-library/a",
      "public/space/ws-1/media-library/new-id",
    )
    expect(mockReplaceImages).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        savedReplyId: "created-reply",
        mediaLibraryFileIds: ["new-file"],
      },
      ctx.tx,
    )
    expect(ctx.trackCopiedObject).toHaveBeenCalledWith(
      "public/space/ws-1/media-library/new-id",
    )
  })

  test("skips an image-only reply that lost every image", async () => {
    mockCopyObject.mockRejectedValue(new Error("NoSuchKey"))
    const ctx = buildTxContext()

    await settingsAdapter.insert(ctx, [
      {
        sourceId: "reply-1",
        kind: "savedReply",
        shortcut: "sp",
        text: "",
        images: [image("public/space/1/media-library/a")],
      },
    ])

    expect(mockInsertReturning).not.toHaveBeenCalled()
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "savedReply", value: "sp" }),
    )
  })

  test("skips an image whose source object is gone, with a warning", async () => {
    mockCreateId.mockReturnValue("new-id")
    mockInsertReturning.mockResolvedValue([{ id: "created-reply" }])
    mockCopyObject.mockRejectedValue(new Error("NoSuchKey"))
    const ctx = buildTxContext()

    await settingsAdapter.insert(ctx, [
      {
        sourceId: "reply-1",
        kind: "savedReply",
        shortcut: "sp",
        text: "Hi",
        images: [image("public/space/1/media-library/a")],
      },
    ])

    expect(mockCreateFile).not.toHaveBeenCalled()
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "savedReplyImage" }),
    )
    expect(mockReplaceImages).toHaveBeenCalledWith(
      expect.objectContaining({ mediaLibraryFileIds: [] }),
      ctx.tx,
    )
  })

  test("never copies a path outside the public media library", async () => {
    mockInsertReturning.mockResolvedValue([{ id: "created-reply" }])
    const ctx = buildTxContext()

    await settingsAdapter.insert(ctx, [
      {
        sourceId: "reply-1",
        kind: "savedReply",
        shortcut: "sp",
        text: "Hi",
        images: [image("workspaces/2/private/secret.png")],
      },
    ])

    expect(mockCopyObject).not.toHaveBeenCalled()
    expect(ctx.warn).toHaveBeenCalled()
  })

  test("installs a saved reply from an older template without images", async () => {
    mockInsertReturning.mockResolvedValue([{ id: "created-reply" }])
    const ctx = buildTxContext()

    await settingsAdapter.insert(ctx, [
      { sourceId: "reply-1", kind: "savedReply", shortcut: "sp", text: "Hi" },
    ])

    expect(mockReplaceImages).toHaveBeenCalledWith(
      expect.objectContaining({ mediaLibraryFileIds: [] }),
      ctx.tx,
    )
  })
})
