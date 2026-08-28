// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { mockCreate, mockCreateId } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockCreateId: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { savedReplyModel: {}, botFieldModel: {} } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  savedReplyModel: { table: "SavedReply" },
}))

vi.mock("@chatbotx.io/utils", () => ({
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
