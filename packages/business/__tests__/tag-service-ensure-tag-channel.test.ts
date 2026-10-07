import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// tagService.ensureTagChannel against an in-memory TagChannel table that
// enforces the same unique key as `TagChannel_tag_integration_key`
// (tagId, channelType, integrationId).
// ---------------------------------------------------------------------------

type TagChannelRow = {
  id: string
  workspaceId: string
  tagId: string
  channelType: string
  integrationId: string
  externalLabelId: string
}

const tagChannelRows: TagChannelRow[] = []
let nextId = 0

const sameKey = (a: TagChannelRow, b: TagChannelRow) =>
  a.tagId === b.tagId &&
  a.channelType === b.channelType &&
  a.integrationId === b.integrationId

const insertTagChannel = (values: TagChannelRow) => ({
  onConflictDoUpdate: (conflict: { set: Record<string, unknown> }) => ({
    returning: () => {
      const existing = tagChannelRows.find((row) => sameKey(row, values))
      if (!existing) {
        tagChannelRows.push(values)
        return Promise.resolve([{ id: values.id }])
      }
      if ("externalLabelId" in conflict.set) {
        existing.externalLabelId = values.externalLabelId
      }
      return Promise.resolve([{ id: existing.id }])
    },
  }),
  onConflictDoNothing: () => ({
    returning: () => {
      if (tagChannelRows.some((row) => sameKey(row, values))) {
        return Promise.resolve([])
      }
      tagChannelRows.push(values)
      return Promise.resolve([{ id: values.id }])
    },
  }),
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: () => ({ values: insertTagChannel }),
    query: {
      tagChannelModel: {
        findFirst: async ({ where }: { where: Partial<TagChannelRow> }) =>
          tagChannelRows.find((row) =>
            Object.entries(where).every(
              ([key, value]) => row[key as keyof TagChannelRow] === value,
            ),
          ),
      },
    },
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (left: unknown, right: unknown) => ({ eq: [left, right] }),
  findOrFail: vi.fn(),
  inArray: (left: unknown, right: unknown) => ({ inArray: [left, right] }),
  isNotNull: (column: unknown) => ({ isNotNull: column }),
  isNull: (column: unknown) => ({ isNull: column }),
  notExists: (query: unknown) => ({ notExists: query }),
  sql: (strings: TemplateStringsArray) => ({ sql: strings.join("?") }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tagChannelModel: {
    id: "TagChannel.id",
    tagId: "TagChannel.tagId",
    channelType: "TagChannel.channelType",
    integrationId: "TagChannel.integrationId",
    externalLabelId: "TagChannel.externalLabelId",
  },
  tagModel: {},
  contactsToTagsModel: {},
  contactToTagChannelModel: {},
  contactInboxModel: {},
  contactModel: {},
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => `tc-${++nextId}` }
})

vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied: vi.fn(),
  emitTagRemoved: vi.fn(),
}))
vi.mock("../src/ads-conversion/service", () => ({
  adsConversionService: { enqueueTagAppliedEvaluationsBulk: vi.fn() },
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: async (_key: string, callback: () => Promise<unknown>) =>
    await callback(),
}))
vi.mock("../src/contact", () => ({ contactService: {} }))
vi.mock("../src/tag/sync.service", () => ({ tagSyncService: {} }))

const { tagService } = await import("../src/tag/service")

const mapping = (externalLabelId: string) => ({
  workspaceId: "ws-1",
  tagId: "tag-1",
  channelType: "messenger" as const,
  integrationId: "intg-1",
  externalLabelId,
})

beforeEach(() => {
  tagChannelRows.length = 0
  nextId = 0
})

describe("tagService.ensureTagChannel", () => {
  test("creates the mapping when the tag has none on this integration", async () => {
    const id = await tagService.ensureTagChannel(mapping("label-a"))

    expect(id).toBe("tc-1")
    expect(tagChannelRows).toEqual([
      expect.objectContaining({ id: "tc-1", externalLabelId: "label-a" }),
    ])
  })

  test("repoints the mapping to the new label id when a label is re-created with the same name", async () => {
    await tagService.ensureTagChannel(mapping("label-a"))

    const id = await tagService.ensureTagChannel(mapping("label-b"))

    expect(id).toBe("tc-1")
    expect(tagChannelRows).toHaveLength(1)
    expect(tagChannelRows[0]?.externalLabelId).toBe("label-b")
  })

  test("is idempotent for the same label id", async () => {
    await tagService.ensureTagChannel(mapping("label-a"))

    const id = await tagService.ensureTagChannel(mapping("label-a"))

    expect(id).toBe("tc-1")
    expect(tagChannelRows).toHaveLength(1)
    expect(tagChannelRows[0]?.externalLabelId).toBe("label-a")
  })
})
