import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// integrationMessengerRepository.listPersonasByWorkspaceId — the projected
// read backing the flow editor's "Set Persona" picker. Mocks `db` at the
// module boundary so the query is scoped exactly to `workspaceId` and only
// selects `name`/`personas`, without touching a real database.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  isNull: vi.fn(),
  select: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: { select: mocks.select },
  eq: mocks.eq,
  isNull: mocks.isNull,
  sql: mocks.sql,
}))

vi.mock("../src/schema", () => ({
  integrationMessengerModel: {
    createdAt: "createdAt",
    name: "name",
    personas: "personas",
    workspaceId: "workspaceId",
  },
}))

const { integrationMessengerRepository } = await import(
  "../src/repositories/integration-messenger/repository"
)

function chain(finalResult: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    orderBy: vi.fn(() => Promise.resolve(finalResult)),
    where: vi.fn(() => builder),
  }
  return builder
}

describe("integrationMessengerRepository.listPersonasByWorkspaceId", () => {
  test("selects only name and personas, scoped to workspaceId, ordered by createdAt", async () => {
    const rows = [{ name: "Support Page", personas: [] }]
    const builder = chain(rows)
    mocks.select.mockReturnValue(builder)

    const result =
      await integrationMessengerRepository.listPersonasByWorkspaceId(
        "workspace-1",
      )

    expect(result).toEqual(rows)
    expect(mocks.select).toHaveBeenCalledWith({
      name: "name",
      personas: "personas",
    })
    expect(mocks.eq).toHaveBeenCalledWith("workspaceId", "workspace-1")
    expect(builder.orderBy).toHaveBeenCalledWith("createdAt")
  })
})
