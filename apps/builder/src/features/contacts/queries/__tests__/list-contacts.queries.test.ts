// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => ({
  countWithRelationsFilterCapped: vi.fn(),
  countWithRelationsFilter: vi.fn(),
  db: { query: { contactModel: { findMany: vi.fn() } }, $count: vi.fn() },
}))
vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: (criteria: unknown) => ({
    conversation: { status: "open" },
    __filter: criteria,
  }),
  buildSmartKeywordWhere: (
    keyword: string,
    options?: { includeEmailAndPhone?: boolean },
  ) => {
    const normalizedKeyword = keyword.toLowerCase()
    return {
      OR: [
        { firstName: { ilike: `%${normalizedKeyword}%` } },
        { lastName: { ilike: `%${normalizedKeyword}%` } },
        ...(options?.includeEmailAndPhone === false
          ? []
          : [
              { email: { ilike: `%${normalizedKeyword}%` } },
              { phoneNumber: { ilike: `%${normalizedKeyword}%` } },
            ]),
      ],
    }
  },
  pruneEmailPhoneFilterConditions: (
    contactFilter:
      | { operator: "and" | "or"; conditions: unknown[] }
      | undefined,
    canViewEmailAndPhone: boolean,
  ) =>
    canViewEmailAndPhone || !contactFilter
      ? contactFilter
      : {
          operator: contactFilter.operator,
          conditions: contactFilter.conditions.filter((condition) => {
            const field =
              typeof condition === "object" && condition !== null
                ? (condition as { field?: unknown }).field
                : undefined
            return ![
              "email",
              "phone",
              "hasContactInfo",
              "emailWasVerified",
              "optedInForEmail",
              "existingContact",
            ].includes(String(field))
          }),
        },
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

const { countWithRelationsFilterCapped, db } = await import(
  "@chatbotx.io/database/client"
)
const { generateWhere, listContactsForAPI, resolveOrderBy } = await import(
  "../list-contacts.queries"
)
const { CONTACTS_DEFAULT_PER_PAGE } = await import("../../constants")

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

  test("drops email and phone keyword clauses when emailAndPhone is denied", () => {
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

  test("prunes email/phone contact-filter conditions when emailAndPhone is denied", () => {
    const where = generateWhere(
      {
        ...baseInput,
        contactFilter: {
          operator: "and",
          conditions: [
            { field: "email", operator: "eq", value: "ada@example.com" },
            { field: "fullName", operator: "contains", value: "Ada" },
          ],
        },
      },
      { canViewEmailAndPhone: false },
    )

    expect(where.__filter).toEqual({
      operator: "and",
      conditions: [{ field: "fullName", operator: "contains", value: "Ada" }],
    })
  })

  test("ANDs keyword search with OR contact filter without overwriting keyword search", () => {
    const contactFilter = {
      operator: "or" as const,
      conditions: [
        {
          field: "fullName" as const,
          operator: "contains" as const,
          value: "Bob",
        },
      ],
    }
    const where = generateWhere(
      {
        ...baseInput,
        keyword: "Alice",
        contactFilter,
      },
      { canViewEmailAndPhone: true },
    )

    expect(where).toEqual({
      workspaceId: "1",
      AND: [
        {
          OR: [
            { firstName: { ilike: "%alice%" } },
            { lastName: { ilike: "%alice%" } },
            { email: { ilike: "%alice%" } },
            { phoneNumber: { ilike: "%alice%" } },
          ],
        },
        {
          conversation: { status: "open" },
          __filter: contactFilter,
        },
      ],
    })
  })
})

describe("listContactsForAPI", () => {
  test("defaults to the contacts table page size when perPage is omitted", async () => {
    vi.mocked(db.query.contactModel.findMany).mockResolvedValue([])
    vi.mocked(countWithRelationsFilterCapped).mockResolvedValue({
      total: 10_000,
      capped: true,
      cap: 10_000,
    })

    const result = await listContactsForAPI({
      workspaceId: "1",
      page: 1,
    })

    expect(db.query.contactModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: CONTACTS_DEFAULT_PER_PAGE,
        offset: 0,
      }),
    )
    expect(result.pageCount).toBe(200)
  })

  test("uses capped count metadata for page count and total display", async () => {
    vi.mocked(db.query.contactModel.findMany).mockResolvedValue([])
    vi.mocked(countWithRelationsFilterCapped).mockResolvedValue({
      total: 10_000,
      capped: true,
      cap: 10_000,
    })

    const result = await listContactsForAPI({
      workspaceId: "1",
      page: 1,
      perPage: 20,
    })

    expect(countWithRelationsFilterCapped).toHaveBeenCalledWith(
      expect.objectContaining({
        cap: 10_000,
        table: { createdAt: "createdAt", fullName: "fullName" },
        tsName: "contactModel",
      }),
    )
    expect(result).toEqual({
      data: [],
      pageCount: 500,
      totalCount: 10_000,
      totalCountCapped: true,
    })
  })
})
