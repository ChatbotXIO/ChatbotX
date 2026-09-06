import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// integrationMessengerRepository — clone/template-lookup additions. Mocks
// `db` at the module boundary so query shapes are asserted without touching a
// real database.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  select: vi.fn(),
  findFirstMessengerMessageTemplate: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {
    select: mocks.select,
    query: {
      messengerMessageTemplateModel: {
        findFirst: mocks.findFirstMessengerMessageTemplate,
      },
    },
  },
  eq: mocks.eq,
  inArray: mocks.inArray,
  isNull: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("../src/schema", () => ({
  integrationMessengerModel: {
    id: "id",
    workspaceId: "workspaceId",
    pageId: "pageId",
  },
  messengerMessageTemplateModel: {
    id: "id",
    integrationMessengerId: "integrationMessengerId",
  },
}))

const { integrationMessengerRepository } = await import(
  "../src/repositories/integration-messenger/repository"
)

function selectChain(finalResult: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => Promise.resolve(finalResult)),
  }
  return builder
}

describe("integrationMessengerRepository.listByIds", () => {
  test("returns [] for an empty id list without issuing a query", async () => {
    const result = await integrationMessengerRepository.listByIds({ ids: [] })

    expect(result).toEqual([])
    expect(mocks.select).not.toHaveBeenCalled()
  })

  test("queries by inArray when ids are provided", async () => {
    const rows = [{ id: "im_1" }]
    mocks.select.mockReturnValue(selectChain(rows))

    const result = await integrationMessengerRepository.listByIds({
      ids: ["im_1"],
    })

    expect(result).toEqual(rows)
    expect(mocks.inArray).toHaveBeenCalledWith("id", ["im_1"])
  })
})

describe("integrationMessengerRepository.findMessageTemplateForClone", () => {
  test("scopes the lookup by workspace via the integrationMessenger relation", async () => {
    const row = { id: "tpl_1" }
    mocks.findFirstMessengerMessageTemplate.mockResolvedValue(row)

    const result =
      await integrationMessengerRepository.findMessageTemplateForClone({
        workspaceId: "ws_1",
        integrationMessengerId: "im_1",
        templateId: "tpl_1",
      })

    expect(result).toEqual(row)
    expect(mocks.findFirstMessengerMessageTemplate).toHaveBeenCalledWith({
      where: {
        id: "tpl_1",
        integrationMessengerId: "im_1",
        integrationMessenger: {
          workspaceId: "ws_1",
        },
      },
    })
  })

  test("returns null when no template matches", async () => {
    mocks.findFirstMessengerMessageTemplate.mockResolvedValue(undefined)

    const result =
      await integrationMessengerRepository.findMessageTemplateForClone({
        workspaceId: "ws_1",
        integrationMessengerId: "im_1",
        templateId: "missing",
      })

    expect(result).toBeNull()
  })
})
