import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: [Array.from(strings), values],
  })),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {},
  eq: mocks.eq,
  inArray: mocks.inArray,
  isNull: mocks.isNull,
  sql: mocks.sql,
}))

vi.mock("../src/schema", () => ({
  integrationInstagramModel: {
    id: "id",
    workspaceId: "workspaceId",
    inboxId: "inboxId",
    igId: "igId",
    pageId: "pageId",
    capiScopeCheckedAt: "capiScopeCheckedAt",
    datasetId: "datasetId",
  },
}))

const { integrationInstagramRepository } = await import(
  "../src/repositories/integration-instagram/repository"
)

describe("integrationInstagramRepository.insert", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("inserts an Instagram integration row and returns it", async () => {
    const insertedRow = { id: "integration-1", igId: "ig-1", type: "instagram" }
    const returning = vi.fn().mockResolvedValue([insertedRow])
    const values = vi.fn(() => ({ returning }))
    const insert = vi.fn(() => ({ values }))
    const tx = { insert } as never

    await expect(
      integrationInstagramRepository.insert(
        {
          id: "integration-1",
          workspaceId: "workspace-1",
          inboxId: "inbox-1",
          igId: "ig-1",
          pageId: "page-1",
          auth: {},
          name: "My Account",
          username: "myaccount",
        },
        tx,
      ),
    ).resolves.toEqual(insertedRow)

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "integration-1",
        igId: "ig-1",
        username: "myaccount",
      }),
    )
    // `type`/`conversationStarters` both carry a column default, so an
    // omitted key is passed straight through undefined — the SQL layer
    // (drizzle's dialect) applies the default, not this repository.
    expect(values.mock.calls[0]?.[0]).not.toHaveProperty("type")
    // `conversationStarters`/`persistentMenus` are NOT NULL with no database
    // default (drizzle-kit drops a jsonb `sql` default from the snapshot, so
    // the schema default was never migrated) while `$inferInsert` still marks
    // them optional, so an omitted value must be written as an explicit empty
    // array. Pinned against the real columns in
    // `__tests__/integration/insert-required-columns.test.ts`.
    expect(values.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        conversationStarters: [],
        persistentMenus: [],
      }),
    )
  })

  test("writes type/conversationStarters through when provided (Facebook-linked login)", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "integration-1" }])
    const values = vi.fn(() => ({ returning }))
    const insert = vi.fn(() => ({ values }))
    const tx = { insert } as never

    await integrationInstagramRepository.insert(
      {
        id: "integration-1",
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
        igId: "ig-1",
        pageId: "page-1",
        auth: {},
        name: "My Account",
        username: "myaccount",
        type: "facebook",
        persistentMenus: [],
        conversationStarters: [],
      },
      tx,
    )

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ type: "facebook", conversationStarters: [] }),
    )
  })
})

describe("integrationInstagramRepository.findConnectedIgIds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("short-circuits to an empty Set without querying when given no ids", async () => {
    await expect(
      integrationInstagramRepository.findConnectedIgIds([]),
    ).resolves.toEqual(new Set())
  })

  test("returns the connected ig ids as a Set", async () => {
    const where = vi
      .fn()
      .mockResolvedValue([{ igId: "ig-1" }, { igId: "ig-2" }])
    const from = vi.fn(() => ({ where }))
    const select = vi.fn(() => ({ from }))
    const tx = { select } as never

    await expect(
      integrationInstagramRepository.findConnectedIgIds(
        ["ig-1", "ig-2", "ig-3"],
        tx,
      ),
    ).resolves.toEqual(new Set(["ig-1", "ig-2"]))
    expect(mocks.inArray).toHaveBeenCalledWith("igId", ["ig-1", "ig-2", "ig-3"])
  })
})
