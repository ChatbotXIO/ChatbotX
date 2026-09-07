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
  integrationMessengerModel: {
    id: "id",
    workspaceId: "workspaceId",
    inboxId: "inboxId",
    pageId: "pageId",
    createdAt: "createdAt",
    capiScopeCheckedAt: "capiScopeCheckedAt",
    datasetId: "datasetId",
  },
}))

const { integrationMessengerRepository } = await import(
  "../src/repositories/integration-messenger/repository"
)

describe("integrationMessengerRepository.insert", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("inserts a Messenger integration row and returns it", async () => {
    const insertedRow = {
      id: "integration-1",
      workspaceId: "workspace-1",
      inboxId: "inbox-1",
      pageId: "page-1",
    }
    const returning = vi.fn().mockResolvedValue([insertedRow])
    const values = vi.fn(() => ({ returning }))
    const insert = vi.fn(() => ({ values }))
    const tx = { insert } as never

    await expect(
      integrationMessengerRepository.insert(
        {
          id: "integration-1",
          workspaceId: "workspace-1",
          inboxId: "inbox-1",
          pageId: "page-1",
          auth: { tokens: { accessToken: "token" } },
          name: "My Page",
          persistentMenus: [],
        },
        tx,
      ),
    ).resolves.toEqual(insertedRow)

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "id", pageId: "pageId" }),
    )
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "integration-1",
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
        pageId: "page-1",
        name: "My Page",
      }),
    )
  })

  // The drizzle schema declares `.default(sql`[]`)` for conversationStarters/
  // persistentMenus/personas, but the database columns are NOT NULL with no
  // default (drizzle-kit drops a jsonb `sql` default from the snapshot, so the
  // schema default was never migrated) while `$inferInsert` still marks them
  // optional — so the repository must always write an explicit value or the
  // insert fails. Pinned against the real columns in
  // `__tests__/integration/insert-required-columns.test.ts`.
  test("writes conversationStarters/persistentMenus/personas through when provided, and explicit empty arrays when omitted", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "integration-1" }])
    const values = vi.fn(() => ({ returning }))
    const insert = vi.fn(() => ({ values }))
    const tx = { insert } as never

    await integrationMessengerRepository.insert(
      {
        id: "integration-1",
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
        pageId: "page-1",
        auth: {},
        name: "My Page",
      },
      tx,
    )

    expect(values.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      }),
    )

    await integrationMessengerRepository.insert(
      {
        id: "integration-2",
        workspaceId: "workspace-1",
        inboxId: "inbox-2",
        pageId: "page-2",
        auth: {},
        name: "My Page 2",
        persistentMenus: [],
        conversationStarters: [{ question: "Hi?", flowId: "flow-1" }],
        personas: [],
      },
      tx,
    )

    expect(values).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationStarters: [{ question: "Hi?", flowId: "flow-1" }],
        personas: [],
      }),
    )
  })
})

describe("integrationMessengerRepository.findConnectedPageIds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("short-circuits to an empty Set without querying when given no ids", async () => {
    await expect(
      integrationMessengerRepository.findConnectedPageIds([]),
    ).resolves.toEqual(new Set())
  })

  test("returns the connected page ids as a Set", async () => {
    const where = vi
      .fn()
      .mockResolvedValue([{ pageId: "page-1" }, { pageId: "page-2" }])
    const from = vi.fn(() => ({ where }))
    const select = vi.fn(() => ({ from }))
    const tx = { select } as never

    await expect(
      integrationMessengerRepository.findConnectedPageIds(
        ["page-1", "page-2", "page-3"],
        tx,
      ),
    ).resolves.toEqual(new Set(["page-1", "page-2"]))
    expect(mocks.inArray).toHaveBeenCalledWith("pageId", [
      "page-1",
      "page-2",
      "page-3",
    ])
  })
})
