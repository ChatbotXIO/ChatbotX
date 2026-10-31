// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  upsertByNames: vi.fn(),
  resolveByNameAndType: vi.fn(),
  updates: [] as {
    table: string
    set: Record<string, unknown>
    where: unknown
  }[],
  existingTags: [] as { id: string; name: string }[],
}))

vi.mock("@chatbotx.io/database/client", () => ({
  inArray: (column: unknown, values: unknown) => ({ column, values }),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  tagModel: { table: "Tag", id: "Tag.id" },
  customFieldModel: { table: "CustomField", id: "CustomField.id" },
}))
vi.mock("../src/tag/service", () => ({
  tagService: { upsertByNames: mocks.upsertByNames },
}))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: { resolveByNameAndType: mocks.resolveByNameAndType },
}))

const { resolveTagManifest } = await import(
  "../src/template/adapters/manifests/tags"
)
const { resolveCustomFieldManifest } = await import(
  "../src/template/adapters/manifests/custom-fields"
)

const makeCtx = () => ({
  tx: {
    query: {
      tagModel: { findMany: () => Promise.resolve(mocks.existingTags) },
    },
    update: (model: { table: string }) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: unknown) => {
          mocks.updates.push({ table: model.table, set, where })
          return Promise.resolve()
        },
      }),
    }),
  } as never,
  workspaceId: "ws-1",
  installationId: "inst-1",
  idMaps: {} as Record<string, Map<string, string>>,
  track: vi.fn(),
  warn: vi.fn(),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.existingTags = []
})

describe("tags created from the manifest", () => {
  const manifest = { "1": { name: "new" }, "2": { name: "old" } }

  test("only the tags this install created go into the install folder", async () => {
    mocks.existingTags = [{ id: "t-old", name: "old" }]
    mocks.upsertByNames.mockResolvedValue([
      { id: "t-new", name: "new" },
      { id: "t-old", name: "old" },
    ])
    const ctx = makeCtx()
    const installFolder = vi.fn().mockResolvedValue("root-tag")

    await resolveTagManifest(ctx, manifest, { installFolder })

    expect(mocks.updates).toEqual([
      {
        table: "Tag",
        set: { folderId: "root-tag" },
        where: { column: "Tag.id", values: ["t-new"] },
      },
    ])
    expect(ctx.track).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "t-old", wasExisting: true }),
    )
  })

  test("nothing is moved and no folder is made when every tag already existed", async () => {
    mocks.existingTags = [{ id: "t-old", name: "old" }]
    mocks.upsertByNames.mockResolvedValue([{ id: "t-old", name: "old" }])
    const installFolder = vi.fn().mockResolvedValue("root-tag")

    await resolveTagManifest(
      makeCtx(),
      { "2": { name: "old" } },
      { installFolder },
    )

    expect(mocks.updates).toHaveLength(0)
    expect(installFolder).not.toHaveBeenCalled()
  })

  test("without an install folder tags stay where they are created", async () => {
    mocks.upsertByNames.mockResolvedValue([{ id: "t-new", name: "new" }])
    await resolveTagManifest(makeCtx(), { "1": { name: "new" } })
    expect(mocks.updates).toHaveLength(0)
  })
})

describe("custom fields created from the manifest", () => {
  test("only created fields are placed; a reused field is never moved", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      resolved: new Map([
        ["text:a", { id: "cf-new", name: "a", renamed: false }],
        ["text:b", { id: "cf-old", name: "b", renamed: false }],
      ]),
      createdIds: ["cf-new"],
    })
    const installFolder = vi.fn().mockResolvedValue("root-field")

    await resolveCustomFieldManifest(
      makeCtx(),
      {
        "1": { name: "a", type: "text" },
        "2": { name: "b", type: "text" },
      } as never,
      { installFolder },
    )

    expect(mocks.updates).toEqual([
      {
        table: "CustomField",
        set: { folderId: "root-field" },
        where: { column: "CustomField.id", values: ["cf-new"] },
      },
    ])
  })

  test("no placement and no folder when nothing was created", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      resolved: new Map([
        ["text:b", { id: "cf-old", name: "b", renamed: false }],
      ]),
      createdIds: [],
    })
    const installFolder = vi.fn()
    await resolveCustomFieldManifest(
      makeCtx(),
      { "2": { name: "b", type: "text" } } as never,
      { installFolder },
    )
    expect(mocks.updates).toHaveLength(0)
    expect(installFolder).not.toHaveBeenCalled()
  })
})
