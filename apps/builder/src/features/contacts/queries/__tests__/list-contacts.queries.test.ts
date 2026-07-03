// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { contactModel: { findMany: vi.fn() } }, $count: vi.fn() },
  relationsFilterToSQL: vi.fn(),
}))
vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: { createdAt: "createdAt", fullName: "fullName" },
}))
vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
}))
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const { resolveOrderBy } = await import("../list-contacts.queries")

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
