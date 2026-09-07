import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// messengerIntegrationService.syncMessageTemplates — full sync deletes rows
// no longer present upstream; partial sync (single created/cloned template)
// never deletes.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  del: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  createId: vi.fn(() => "new-id"),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
  db: { transaction: mocks.transaction },
  eq: mocks.eq,
  findOrFail: vi.fn(),
  inArray: mocks.inArray,
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: {},
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationMessengerModel: {
    id: "id",
    workspaceId: "workspaceId",
    pageId: "pageId",
    auth: "auth",
  },
  messengerMessageTemplateModel: {
    id: "id",
    sourceId: "sourceId",
    integrationMessengerId: "integrationMessengerId",
    name: "name",
    language: "language",
    category: "category",
    status: "status",
    parameterFormat: "parameterFormat",
    components: "components",
  },
}))

const { messengerIntegrationService } = await import(
  "../src/integration-messenger/service"
)

function selectChain(finalResult: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn(() => Promise.resolve(finalResult)),
  }
}

function mutationChain() {
  const builder = {
    values: vi.fn(() => builder),
    onConflictDoUpdate: vi.fn(() => Promise.resolve(undefined)),
    where: vi.fn(() => Promise.resolve(undefined)),
  }
  return builder
}

describe("messengerIntegrationService.syncMessageTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createId.mockReturnValue("new-id")
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) => {
        const tx = {
          select: mocks.select,
          delete: mocks.del,
          insert: mocks.insert,
        }
        return await callback(tx)
      },
    )
  })

  test("full sync deletes exactly the non-incoming ids", async () => {
    mocks.select.mockReturnValue(
      selectChain([
        { id: "tpl_stale", sourceId: "src_stale" },
        { id: "tpl_keep", sourceId: "src_keep" },
      ]),
    )
    const deleteBuilder = { where: vi.fn(() => Promise.resolve(undefined)) }
    mocks.del.mockReturnValue(deleteBuilder)
    mocks.insert.mockReturnValue(mutationChain())

    await messengerIntegrationService.syncMessageTemplates({
      integrationMessengerId: "im_1",
      isPartialSync: false,
      templates: [
        {
          id: "src_keep",
          name: "Keep",
          language: "en_US",
          category: "UTILITY",
          status: "APPROVED",
          components: [],
        },
      ],
    })

    expect(mocks.del).toHaveBeenCalledOnce()
    expect(mocks.inArray).toHaveBeenCalledWith("id", ["tpl_stale"])
  })

  test("partial sync skips the stale-delete", async () => {
    mocks.select.mockReturnValue(selectChain([]))
    mocks.insert.mockReturnValue(mutationChain())

    await messengerIntegrationService.syncMessageTemplates({
      integrationMessengerId: "im_1",
      isPartialSync: true,
      templates: [
        {
          id: "src_new",
          name: "New",
          language: "en_US",
          category: "UTILITY",
          status: "APPROVED",
          components: [],
        },
      ],
    })

    expect(mocks.del).not.toHaveBeenCalled()
    // select is still not needed for a partial sync's stale-delete path.
    expect(mocks.select).not.toHaveBeenCalled()
  })
})
