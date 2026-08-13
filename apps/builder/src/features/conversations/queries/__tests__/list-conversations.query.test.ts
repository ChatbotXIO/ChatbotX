// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ContactFilterCriteria } from "@/features/contact-filter/schemas"

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findManyQuery: vi.fn() },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: vi.fn(),
}))
vi.mock("@chatbotx.io/database/client", () => ({
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: vi.fn(() => ({})),
  buildSmartKeywordWhere: vi.fn(
    (keyword: string, options?: { includeEmailAndPhone?: boolean }) => ({
      OR: [
        { firstName: { ilike: `%${keyword}%` } },
        { lastName: { ilike: `%${keyword}%` } },
        ...(options?.includeEmailAndPhone === false
          ? []
          : [{ email: { ilike: `%${keyword}%` } }]),
      ],
    }),
  ),
  parseConversationAssigneeValues: vi.fn((values: string[]) => ({
    hasUnassigned: values.includes("unassigned"),
    inboxTeamIds: values
      .filter((value) => value.startsWith("t_"))
      .map((value) => value.slice(2)),
    userIds: values
      .filter((value) => value.startsWith("u_"))
      .map((value) => value.slice(2)),
  })),
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
  UNASSIGNED_ASSIGNEE_VALUE: "unassigned",
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(),
}))
vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
}))
vi.mock("@/lib/pagination", () => ({
  decodeCursor: vi.fn(),
  encodeCursor: vi.fn(),
}))

const { buildConversationWhere } = await import("../build-conversation-where")
const { applyContactFilter, buildSmartKeywordWhere } = await import(
  "@chatbotx.io/database/queries"
)

const baseInput = {
  perPage: 20,
  cursor: undefined,
  keyword: "",
  botCategory: "all" as const,
  assignedId: "all",
  tags: [],
}

describe("buildConversationWhere channel filter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("does not restrict by contactInboxes when channel is the omnichannel sentinel", () => {
    const where = buildConversationWhere(
      "1",
      { ...baseInput, channel: "omnichannel" },
      null,
    )

    expect(where.contactInboxes).toBeUndefined()
  })

  test("restricts by contactInboxes when a real channel is selected", () => {
    const where = buildConversationWhere(
      "1",
      { ...baseInput, channel: "messenger" },
      null,
    )

    expect(where.contactInboxes).toEqual({ channel: "messenger" })
  })

  test("composes keyword and contact filter OR branches without overwriting either", () => {
    vi.mocked(applyContactFilter).mockReturnValueOnce({
      OR: [{ email: { ilike: "%ada%" } }],
    })

    const where = buildConversationWhere(
      "1",
      {
        ...baseInput,
        keyword: "ada",
        contactFilter: { operator: "or", conditions: [] },
      },
      null,
    )

    expect(where.contact).toEqual({
      AND: [
        { blockedAt: { isNull: true } },
        {
          OR: [
            { firstName: { ilike: "%ada%" } },
            { lastName: { ilike: "%ada%" } },
            { email: { ilike: "%ada%" } },
          ],
        },
        { OR: [{ email: { ilike: "%ada%" } }] },
      ],
    })
  })

  test("forwards a restricted email/phone scope to the smart keyword search", () => {
    buildConversationWhere("1", { ...baseInput, keyword: "ada@x.com" }, null, {
      includeEmailAndPhone: false,
    })

    expect(vi.mocked(buildSmartKeywordWhere)).toHaveBeenCalledWith(
      "ada@x.com",
      {
        includeEmailAndPhone: false,
      },
    )
  })

  test("prunes email/phone contact-filter conditions when emailAndPhone is denied", () => {
    const contactFilter = {
      operator: "and" as const,
      conditions: [
        { field: "email", operator: "eq", value: "ada@example.com" },
        { field: "hasContactInfo", operator: "in", value: ["phone"] },
        { field: "fullName", operator: "contains", value: "Ada" },
      ],
    } satisfies ContactFilterCriteria

    buildConversationWhere("1", { ...baseInput, contactFilter }, null, {
      includeEmailAndPhone: false,
    })

    expect(vi.mocked(applyContactFilter)).toHaveBeenCalledWith(
      {
        operator: "and",
        conditions: [{ field: "fullName", operator: "contains", value: "Ada" }],
      },
      "1",
    )
  })

  test("defaults to including email/phone when no scope is provided", () => {
    buildConversationWhere("1", { ...baseInput, keyword: "ada" }, null)

    expect(vi.mocked(buildSmartKeywordWhere)).toHaveBeenCalledWith("ada", {
      includeEmailAndPhone: true,
    })
  })
})
