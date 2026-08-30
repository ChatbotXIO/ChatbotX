// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { mockCreateId, mockInsert, mockFindFirst } = vi.hoisted(() => {
  const mockInsertValues = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([{ id: "created-folder-id" }]),
  }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockCreateId: vi.fn(() => "created-folder-id"),
    mockInsert,
    mockInsertValues,
    mockFindFirst: vi.fn(),
  }
})

const folderModel = { table: "folder" }

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "0",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  folderModel,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

const { resolveFolderManifest } = await import(
  "../src/template/adapters/manifests/folders"
)

const buildContext = () => ({
  tx: {
    query: { folderModel: { findFirst: mockFindFirst } },
    insert: mockInsert,
  } as never,
  workspaceId: "ws-1",
  installationId: "install-1",
  idMaps: {},
  track: vi.fn(),
  warn: vi.fn(),
})

describe("resolveFolderManifest", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("keys find-or-create on (name, folderType) — same name, different folderType never collide", async () => {
    // Inbound "VIP" already exists; outbound "VIP" does not.
    mockFindFirst.mockImplementation(
      ({ where }: { where: { folderType: string } }) =>
        where.folderType === "automatedResponse"
          ? { id: "existing-inbound-vip", paths: [] }
          : undefined,
    )

    const ctx = buildContext()
    await resolveFolderManifest(
      ctx,
      {
        "src-inbound": {
          name: "VIP",
          folderType: "automatedResponse",
          parentSourceId: null,
        },
        "src-outbound": {
          name: "VIP",
          folderType: "outboundAutomatedResponse",
          parentSourceId: null,
        },
      },
      "keywords",
    )

    expect(ctx.idMaps.folder?.get("src-inbound")).toBe("existing-inbound-vip")
    expect(ctx.idMaps.folder?.get("src-outbound")).toBe("created-folder-id")

    // The inbound lookup matched an existing row (wasExisting: true); the
    // outbound lookup found nothing under its own folderType and created a
    // new row (wasExisting: false) — proving the two "VIP" folders were
    // never treated as the same row.
    expect(ctx.track).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: "existing-inbound-vip",
        wasExisting: true,
      }),
    )
    expect(ctx.track).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: "created-folder-id",
        wasExisting: false,
      }),
    )
  })

  test("resolves a child folder after its parent in the same pass set", async () => {
    mockFindFirst.mockResolvedValue(undefined)

    const ctx = buildContext()
    await resolveFolderManifest(
      ctx,
      {
        "src-child": {
          name: "Child",
          folderType: "flow",
          parentSourceId: "src-parent",
        },
        "src-parent": {
          name: "Parent",
          folderType: "flow",
          parentSourceId: null,
        },
      },
      "flows",
    )

    expect(ctx.idMaps.folder?.get("src-parent")).toBeDefined()
    expect(ctx.idMaps.folder?.get("src-child")).toBeDefined()
    expect(ctx.warn).not.toHaveBeenCalled()
  })
})
