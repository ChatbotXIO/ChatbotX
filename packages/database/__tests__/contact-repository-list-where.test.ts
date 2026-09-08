// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

vi.mock("../src/queries", () => ({
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
vi.mock("../src/schema", () => ({
  contactModel: { createdAt: "createdAt", fullName: "fullName" },
}))

const { buildContactListWhere, resolveContactOrderBy } = await import(
  "../src/repositories/contact/list-where"
)

const baseInput = { workspaceId: "1", includeEmailAndPhone: true }

describe("resolveContactOrderBy", () => {
  test("falls back to createdAt desc when sort is missing", () => {
    expect(resolveContactOrderBy({})).toEqual({ createdAt: "desc" })
  })

  test("falls back to createdAt desc when sort is an empty array", () => {
    expect(resolveContactOrderBy({ sort: [] })).toEqual({
      createdAt: "desc",
    })
  })

  test("uses the explicit sort when a valid column is provided", () => {
    expect(
      resolveContactOrderBy({
        sort: [{ id: "fullName", desc: false }],
      }),
    ).toEqual({ fullName: "asc" })
  })
})

describe("buildContactListWhere", () => {
  test("adds the assigned-user conversation filter", () => {
    const where = buildContactListWhere({
      ...baseInput,
      restrictToAssignedUserId: "user-1",
    })

    expect(where.conversation).toEqual({ assignedUserId: "user-1" })
  })

  test("drops email and phone keyword clauses when emailAndPhone is denied", () => {
    const where = buildContactListWhere({
      ...baseInput,
      keyword: "Alice",
      includeEmailAndPhone: false,
    })

    expect(where.OR).toEqual([
      { firstName: { ilike: "%alice%" } },
      { lastName: { ilike: "%alice%" } },
    ])
  })

  test("preserves existing conversation filters when adding assigned-user scope", () => {
    const where = buildContactListWhere({
      ...baseInput,
      contactFilter: { operator: "and", conditions: [] },
      restrictToAssignedUserId: "user-1",
    })

    expect(where.conversation).toEqual({
      status: "open",
      assignedUserId: "user-1",
    })
  })

  test("prunes email/phone contact-filter conditions when emailAndPhone is denied", () => {
    const where = buildContactListWhere({
      ...baseInput,
      includeEmailAndPhone: false,
      contactFilter: {
        operator: "and",
        conditions: [
          { field: "email", operator: "eq", value: "ada@example.com" },
          { field: "fullName", operator: "contains", value: "Ada" },
        ],
      },
    })

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
    const where = buildContactListWhere({
      ...baseInput,
      keyword: "Alice",
      contactFilter,
    })

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
