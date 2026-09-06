import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// tagChannelRepository — TagChannel / ContactToTagChannel / ContactsToTags
// mutations backing sync-channel-labels.ts and sync-tag.ts. Mocks db at the
// module boundary and asserts onConflict targets / early-return chains that
// were moved verbatim from the original handlers.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: [strings, values],
  })),
  insert: vi.fn(),
  update: vi.fn(),
  deleteFn: vi.fn(),
  select: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  eq: mocks.eq,
  inArray: mocks.inArray,
  sql: mocks.sql,
  db: {
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.deleteFn,
    select: mocks.select,
    query: {
      tagChannelModel: {
        findFirst: mocks.findFirst,
        findMany: mocks.findMany,
      },
      contactToTagChannelModel: { findMany: mocks.findMany },
      contactsToTagsModel: { findMany: mocks.findMany },
    },
  },
}))

vi.mock("../src/schema", () => ({
  tagModel: { id: "id", workspaceId: "workspaceId", name: "name" },
  tagChannelModel: {
    id: "id",
    tagId: "tagId",
    channelType: "channelType",
    integrationId: "integrationId",
    externalLabelId: "externalLabelId",
  },
  contactsToTagsModel: { contactId: "contactId", tagId: "tagId" },
  contactToTagChannelModel: {
    tagId: "tagId",
    tagChannelId: "tagChannelId",
    contactInboxId: "contactInboxId",
  },
  contactInboxModel: { contactId: "contactId", sourceId: "sourceId" },
}))

const { tagChannelRepository } = await import(
  "../src/repositories/tag-channel/repository"
)

function insertChain(finalResult: unknown[] = []) {
  const builder = {
    values: vi.fn(() => builder),
    onConflictDoNothing: vi.fn(() => builder),
    onConflictDoUpdate: vi.fn(() => builder),
    returning: vi.fn(() => Promise.resolve(finalResult)),
  }
  return builder
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("upsertLabelMapping", () => {
  test("exits early when the tag upsert returns no row", async () => {
    mocks.insert.mockReturnValueOnce(insertChain([]))

    await tagChannelRepository.upsertLabelMapping({
      workspaceId: "ws-1",
      channelType: "messenger",
      integrationId: "int-1",
      label: { externalLabelId: "ext-1", name: "VIP" },
      contactInbox: { id: "ci-1", contactId: "c-1" },
    })

    expect(mocks.insert).toHaveBeenCalledTimes(1)
  })

  test("exits early when the tagChannel upsert returns no row", async () => {
    mocks.insert
      .mockReturnValueOnce(insertChain([{ id: "tag-1" }]))
      .mockReturnValueOnce(insertChain([]))

    await tagChannelRepository.upsertLabelMapping({
      workspaceId: "ws-1",
      channelType: "messenger",
      integrationId: "int-1",
      label: { externalLabelId: "ext-1", name: "VIP" },
      contactInbox: { id: "ci-1", contactId: "c-1" },
    })

    expect(mocks.insert).toHaveBeenCalledTimes(2)
  })

  test("links the contact-inbox to the tag and tagChannel when both upserts succeed", async () => {
    mocks.insert
      .mockReturnValueOnce(insertChain([{ id: "tag-1" }]))
      .mockReturnValueOnce(insertChain([{ id: "tc-1" }]))
      .mockReturnValueOnce(insertChain([]))
      .mockReturnValueOnce(insertChain([]))

    await tagChannelRepository.upsertLabelMapping({
      workspaceId: "ws-1",
      channelType: "messenger",
      integrationId: "int-1",
      label: { externalLabelId: "ext-1", name: "VIP" },
      contactInbox: { id: "ci-1", contactId: "c-1" },
    })

    expect(mocks.insert).toHaveBeenCalledTimes(4)
  })
})

describe("insertIfAbsent", () => {
  test("targets the (tagId, channelType, integrationId) conflict key", async () => {
    const chain = insertChain([])
    mocks.insert.mockReturnValue(chain)

    await tagChannelRepository.insertIfAbsent({
      workspaceId: "ws-1",
      tagId: "tag-1",
      channelType: "zalo",
      integrationId: "int-1",
      externalLabelId: "VIP",
    })

    expect(chain.onConflictDoNothing).toHaveBeenCalledWith({
      target: ["tagId", "channelType", "integrationId"],
    })
  })
})

describe("insertOrFetch", () => {
  test("returns the inserted row when the insert wins", async () => {
    mocks.insert.mockReturnValueOnce(insertChain([{ id: "tc-1" }]))

    const result = await tagChannelRepository.insertOrFetch({
      workspaceId: "ws-1",
      tagId: "tag-1",
      channelType: "messenger",
      integrationId: "int-1",
      externalLabelId: "ext-1",
    })

    expect(result).toEqual({ id: "tc-1" })
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })

  test("falls back to a refetch when the insert conflicts", async () => {
    mocks.insert.mockReturnValueOnce(insertChain([]))
    mocks.findFirst.mockResolvedValue({ id: "tc-existing" })

    const result = await tagChannelRepository.insertOrFetch({
      workspaceId: "ws-1",
      tagId: "tag-1",
      channelType: "messenger",
      integrationId: "int-1",
      externalLabelId: "ext-1",
    })

    expect(result).toEqual({ id: "tc-existing" })
    expect(mocks.findFirst).toHaveBeenCalledTimes(1)
  })
})

describe("deleteLinksForChannel / deleteContactTagsForContacts", () => {
  test("no-ops without querying when the id list is empty", async () => {
    await tagChannelRepository.deleteLinksForChannel({
      tagChannelId: "tc-1",
      contactInboxIds: [],
    })
    await tagChannelRepository.deleteContactTagsForContacts({
      tagId: "tag-1",
      contactIds: [],
    })

    expect(mocks.deleteFn).not.toHaveBeenCalled()
  })

  test("deletes scoped to the given ids when non-empty", async () => {
    const chain = { where: vi.fn(() => Promise.resolve(undefined)) }
    mocks.deleteFn.mockReturnValue(chain)

    await tagChannelRepository.deleteLinksForChannel({
      tagChannelId: "tc-1",
      contactInboxIds: ["ci-1", "ci-2"],
    })

    expect(mocks.deleteFn).toHaveBeenCalled()
    expect(mocks.inArray).toHaveBeenCalledWith("contactInboxId", [
      "ci-1",
      "ci-2",
    ])
  })
})

describe("listContactInboxIdsForChannelPage", () => {
  test("pages by contactInboxId ascending, keyed off tagChannelId", async () => {
    mocks.findMany.mockResolvedValue([{ contactInboxId: "ci-1" }])

    const result = await tagChannelRepository.listContactInboxIdsForChannelPage(
      { tagChannelId: "tc-1", limit: 500 },
    )

    expect(result).toEqual([{ contactInboxId: "ci-1" }])
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { tagChannelId: { in: ["tc-1"] } },
      orderBy: { contactInboxId: "asc" },
      limit: 500,
      columns: { contactInboxId: true },
    })
  })

  test("adds the afterContactInboxId gt-filter when a cursor is passed", async () => {
    mocks.findMany.mockResolvedValue([])

    await tagChannelRepository.listContactInboxIdsForChannelPage({
      tagChannelId: "tc-1",
      afterContactInboxId: "ci-5",
      limit: 500,
    })

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        tagChannelId: { in: ["tc-1"] },
        contactInboxId: { gt: "ci-5" },
      },
      orderBy: { contactInboxId: "asc" },
      limit: 500,
      columns: { contactInboxId: true },
    })
  })
})

describe("deleteById", () => {
  test("deletes the tagChannel by its own id", async () => {
    const chain = { where: vi.fn(() => Promise.resolve(undefined)) }
    mocks.deleteFn.mockReturnValue(chain)

    await tagChannelRepository.deleteById({ id: "tc-1" })

    expect(mocks.deleteFn).toHaveBeenCalled()
    expect(mocks.eq).toHaveBeenCalledWith("id", "tc-1")
  })
})
