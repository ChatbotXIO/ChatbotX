// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => ({
  countWithRelationsFilter: vi.fn(),
  db: { query: { contactModel: { findMany: vi.fn() } }, $count: vi.fn() },
}))
vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: (criteria: unknown) => ({
    conversation: { status: "open" },
    __filter: criteria,
  }),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: { createdAt: "createdAt", fullName: "fullName" },
}))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const { generateWhere, resolveOrderBy } = await import(
  "../list-contacts.queries"
)

const baseInput = { workspaceId: "1" }

describe("resolveOrderBy", () => {
  test("falls back to createdAt desc when sort is missing", () => {
    expect(resolveOrderBy(baseInput)).toEqual({ createdAt: "desc" })
  })

  test("falls back to createdAt desc when sort is an empty array", () => {
    expect(resolveOrderBy({ ...baseInput, sort: [] })).toEqual({
      createdAt: "desc",
    })
  })

  test("uses the explicit sort when a valid column is provided", () => {
    expect(
      resolveOrderBy({
        ...baseInput,
        sort: [{ id: "fullName", desc: false }],
      }),
    ).toEqual({ fullName: "asc" })
  })
})

describe("generateWhere", () => {
  test("adds the assigned-user conversation filter", () => {
    const where = generateWhere(baseInput, {
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: "user-1",
    })

    expect(where.conversation).toEqual({ assignedUserId: "user-1" })
  })

  test("drops email and phone keyword clauses when PII is denied", () => {
    const where = generateWhere(
      { ...baseInput, keyword: "Alice" },
      { canViewEmailAndPhone: false },
    )

    expect(where.OR).toEqual([
      { firstName: { ilike: "%alice%" } },
      { lastName: { ilike: "%alice%" } },
    ])
  })

  test("preserves existing conversation filters when adding assigned-user scope", () => {
    const where = generateWhere(
      {
        ...baseInput,
        contactFilter: { operator: "and", conditions: [] },
      },
      {
        canViewEmailAndPhone: true,
        restrictToAssignedUserId: "user-1",
      },
    )

    expect(where.conversation).toEqual({
      status: "open",
      assignedUserId: "user-1",
    })
  })
})
