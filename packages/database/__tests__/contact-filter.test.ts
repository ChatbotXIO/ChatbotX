import { relationsFilterToSQL, type SQL } from "drizzle-orm"
import { alias, PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { operatorTypes } from "../src/partials"
import {
  applyContactFilter,
  buildContactInboxContactFilterSQL,
  buildContactWhere,
  buildSmartKeywordWhere,
  contactFilterHasPredicate,
  parseConversationAssigneeValues,
  pruneEmailPhoneFilterConditions,
} from "../src/queries/contact-filter"
import { isValidDateTimeFilterValue } from "../src/queries/contact-filter/value-format"
import { contactInboxModel, contactModel } from "../src/schema"
import { escapeLikePattern, likeContains } from "../src/utils"

const renderContactWhere = (where: Record<string, unknown>) => {
  const sqlWhere = relationsFilterToSQL(contactModel, where as never)
  if (!sqlWhere) {
    throw new Error("Expected contact filter to render SQL")
  }
  return new PgDialect().sqlToQuery(sqlWhere)
}

const renderFirstRawCondition = (where: Record<string, unknown>) => {
  const raw = (where as { AND?: Array<{ RAW?: unknown }> }).AND?.[0]?.RAW
  expect(typeof raw).toBe("function")

  return new PgDialect().sqlToQuery(
    (raw as (table: typeof contactModel) => SQL)(contactModel),
  )
}

describe("LIKE pattern helpers", () => {
  test("escapes LIKE metacharacters and wraps contains patterns", () => {
    expect(escapeLikePattern("100%_ready\\")).toBe("100\\%\\_ready\\\\")
    expect(likeContains("100%_ready\\")).toBe("%100\\%\\_ready\\\\%")
  })
})

describe("contact filter value-format helpers", () => {
  test.each([
    "2026-05-19",
    "2026-05-19 10:30",
    "2026-05-19T10:30:00Z",
    "2026-05-19T10:30:00+07:00",
    "2024-02-29", // real leap day
  ])("accepts valid datetime value %s", (value) => {
    expect(isValidDateTimeFilterValue(value)).toBe(true)
  })

  test.each([
    "",
    "junk",
    "2026-13-40",
    "2026-05-19 25:99",
    // Regex-valid but not a real calendar date: day <= 31 passes the pattern,
    // yet the ::timestamptz cast downstream would throw on these.
    "2026-02-30",
    "2026-02-29", // 2026 is not a leap year
    "2026-04-31", // April has 30 days
  ])("rejects invalid datetime value %s", (value) => {
    expect(isValidDateTimeFilterValue(value)).toBe(false)
  })
})

describe("contact filter permission helpers", () => {
  test("drops only email/phone contact-filter fields when email and phone are denied", () => {
    const contactFilter = {
      operator: "and" as const,
      conditions: [
        { field: "email", operator: "eq", value: "ada@example.com" },
        { field: "phone", operator: "eq", value: "+84912345678" },
        { field: "hasContactInfo", operator: "in", value: ["email"] },
        { field: "emailWasVerified", operator: "eq", value: "true" },
        { field: "optedInForEmail", operator: "eq", value: "true" },
        { field: "existingContact", operator: "eq", value: "true" },
        { field: "fullName", operator: "contains", value: "Ada" },
      ],
    }

    expect(pruneEmailPhoneFilterConditions(contactFilter, false)).toEqual({
      operator: "and",
      conditions: [{ field: "fullName", operator: "contains", value: "Ada" }],
    })
  })

  test("keeps all contact-filter fields when email and phone are allowed", () => {
    const contactFilter = {
      operator: "or" as const,
      conditions: [
        { field: "email", operator: "eq", value: "ada@example.com" },
        { field: "fullName", operator: "contains", value: "Ada" },
      ],
    }

    expect(pruneEmailPhoneFilterConditions(contactFilter, true)).toBe(
      contactFilter,
    )
  })

  test("normalizes an emptied filter back to AND", () => {
    expect(
      pruneEmailPhoneFilterConditions(
        {
          operator: "or",
          conditions: [{ field: "email", operator: "eq", value: "a@b.co" }],
        },
        false,
      ),
    ).toEqual({ operator: "and", conditions: [] })
  })

  test("preserves the filter timezone while pruning email/phone fields", () => {
    const contactFilter = {
      operator: "and" as const,
      timezone: "Asia/Ho_Chi_Minh",
      conditions: [
        { field: "email", operator: "eq", value: "ada@example.com" },
        {
          field: "customField",
          operator: "isBetween",
          value: ["2026-07-01", "2026-07-31"],
        },
      ],
    }

    // The date-range WHERE resolves against `timezone`; pruning PII conditions
    // must not silently drop it, else the range shifts to UTC for restricted
    // users only. See permission.ts.
    expect(pruneEmailPhoneFilterConditions(contactFilter, false)).toEqual({
      operator: "and",
      timezone: "Asia/Ho_Chi_Minh",
      conditions: [
        {
          field: "customField",
          operator: "isBetween",
          value: ["2026-07-01", "2026-07-31"],
        },
      ],
    })
  })

  test("preserves the filter timezone even when every condition is pruned", () => {
    expect(
      pruneEmailPhoneFilterConditions(
        {
          operator: "or",
          timezone: "America/New_York",
          conditions: [{ field: "email", operator: "eq", value: "a@b.co" }],
        },
        false,
      ),
    ).toEqual({ operator: "and", timezone: "America/New_York", conditions: [] })
  })
})

describe("applyContactFilter", () => {
  test("reports whether a non-empty filter compiles to an effective predicate", () => {
    const unknownOnlyFilter = {
      operator: "and" as const,
      conditions: [
        {
          field: "unknownField",
          operator: operatorTypes.enum.eq,
          value: "x",
        },
      ],
    }
    const validFilter = {
      operator: "and" as const,
      conditions: [
        {
          field: "fullName",
          operator: operatorTypes.enum.contains,
          value: "Ada",
        },
      ],
    }

    expect(applyContactFilter(unknownOnlyFilter)).toEqual({})
    expect(contactFilterHasPredicate(unknownOnlyFilter)).toBe(false)
    expect(contactFilterHasPredicate(validFilter)).toBe(true)
  })

  test("maps inbox filters to an EXISTS ContactInbox.inboxId subquery", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "inbox",
          operator: operatorTypes.enum.in,
          value: ["123", "456"],
        },
      ],
    })

    const query = renderContactWhere(where)

    expect(query.sql).toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(query.sql).toContain('"ContactInbox"."inboxId" in')
    expect(JSON.stringify(query.params)).toContain("123")
    expect(JSON.stringify(query.params)).toContain("456")
  })

  test("renders multiple AND conditions on contactInboxes as EXISTS subqueries", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "currentChannel",
          operator: operatorTypes.enum.in,
          value: ["messenger"],
        },
        {
          field: "inbox",
          operator: operatorTypes.enum.in,
          value: ["123"],
        },
      ],
    })

    const query = renderContactWhere(where)

    expect(query.sql).toContain('"ContactInbox"."channel" in')
    expect(query.sql).toContain('"ContactInbox"."inboxId" in')
    expect(query.sql.match(/EXISTS/g)?.length).toBe(2)
  })

  test("maps tag filters to an EXISTS ContactToTag subquery", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "tags",
          operator: operatorTypes.enum.eq,
          value: ["tag-1"],
        },
      ],
    })

    const query = renderContactWhere(where)

    expect(query.sql).toContain('EXISTS (SELECT 1 FROM "ContactToTag"')
    expect(query.sql).toContain('"ContactToTag"."tagId" in')
    expect(JSON.stringify(query.params)).toContain("tag-1")
  })

  test("maps a custom-field condition to an EXISTS RAW filter", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "text",
          operator: operatorTypes.enum.eq,
          value: "vip",
        },
      ],
    })

    const conditions = (where as { AND?: Array<{ RAW?: unknown }> }).AND
    expect(Array.isArray(conditions)).toBe(true)
    expect(typeof conditions?.[0]?.RAW).toBe("function")
  })

  test("ignores a custom-field condition without a customFieldId", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "customField",
          valueType: "text",
          operator: operatorTypes.enum.eq,
          value: "vip",
        },
      ],
    })

    expect(where).toEqual({})
  })

  test("supports text-search operators for number custom fields", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "number",
          operator: operatorTypes.enum.contains,
          value: "12",
        },
      ],
    })

    const conditions = (where as { AND?: Array<{ RAW?: unknown }> }).AND
    expect(Array.isArray(conditions)).toBe(true)
    expect(typeof conditions?.[0]?.RAW).toBe("function")
  })

  test("renders static startsWith filters with supported SQL", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "fullName",
          operator: operatorTypes.enum.startsWith,
          value: "Al",
        },
      ],
    })

    const query = renderContactWhere(where)

    expect(query.sql).toContain('"Contact"."fullName" ILIKE')
    expect(query.params).toContain("Al%")
  })

  test.each([
    [operatorTypes.enum.startsWith, "Al%"],
    [operatorTypes.enum.endsWith, "%Al"],
    [operatorTypes.enum.contains, "%Al%"],
  ])("renders static text operator %s as supported SQL", (operator, param) => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "email",
          operator,
          value: "Al",
        },
      ],
    })

    const query = renderContactWhere(where)

    expect(query.sql).toContain('"Contact"."email"')
    expect(query.sql.toLowerCase()).toContain("ilike")
    expect(query.params).toContain(param)
  })

  test("escapes LIKE wildcards for static text filters", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "email",
            operator: operatorTypes.enum.contains,
            value: "100%_ready\\ok",
          },
        ],
      }),
    )

    expect(query.params).toContain("%100\\%\\_ready\\\\ok%")
  })

  test("renders static free-text eq as wildcard-free case-insensitive SQL", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "fullName",
            operator: operatorTypes.enum.eq,
            value: "JOHN%_DOE\\",
          },
        ],
      }),
    )

    expect(query.sql).toContain('"Contact"."fullName" ILIKE')
    expect(query.params).toContain("JOHN\\%\\_DOE\\\\")
    expect(query.params).not.toContain("%JOHN\\%\\_DOE\\\\%")
  })

  test("renders static free-text ne as NOT ILIKE plus null fallback", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "email",
            operator: operatorTypes.enum.ne,
            value: "John@Example.com",
          },
        ],
      }),
    )

    expect(query.sql.toLowerCase()).toContain('"contact"."email" not ilike')
    expect(query.sql.toLowerCase()).toContain('"contact"."email" is null')
    expect(query.params).toContain("John@Example.com")
  })

  test("keeps enum and select equality case-sensitive", () => {
    const genderQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "gender",
            operator: operatorTypes.enum.eq,
            value: "male",
          },
        ],
      }),
    )
    const countryQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "country",
            operator: operatorTypes.enum.eq,
            value: "VN",
          },
        ],
      }),
    )

    expect(genderQuery.sql).toContain('"Contact"."gender" =')
    expect(genderQuery.sql.toLowerCase()).not.toContain("ilike")
    expect(countryQuery.sql).toContain('"Contact"."country" =')
    expect(countryQuery.sql.toLowerCase()).not.toContain("ilike")
  })

  test("maps dropdown eq/ne array values to EXISTS/NOT EXISTS IN subqueries", () => {
    const channelQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "currentChannel",
            operator: operatorTypes.enum.eq,
            value: ["messenger", "whatsapp"],
          },
        ],
      }),
    )

    expect(channelQuery.sql).toContain('"ContactInbox"."channel" in')

    const tagQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "tags",
            operator: operatorTypes.enum.ne,
            value: ["tag-1"],
          },
        ],
      }),
    )

    expect(tagQuery.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactToTag"')
    expect(tagQuery.sql).toContain('"ContactToTag"."tagId" in')
    expect(tagQuery.sql).not.toContain('"ContactToTag"."tagId" not in')
  })

  test("renders currentChannel isEmpty as NOT EXISTS ContactInbox", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "currentChannel", operator: operatorTypes.enum.isEmpty },
        ],
      }),
    )

    expect(query.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
  })

  test("renders source filters as an EXISTS ContactInbox.source subquery", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "source",
            operator: operatorTypes.enum.in,
            value: ["direct"],
          },
        ],
      }),
    )

    expect(query.sql).toContain('"ContactInbox"."source" in')
  })

  test("renders interactedInLast24h as an EXISTS ContactInbox recency subquery", () => {
    const positive = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "interactedInLast24h",
            operator: operatorTypes.enum.eq,
            value: "true",
          },
        ],
      }),
    )
    expect(positive.sql).toContain(
      '"ContactInbox"."lastIncomingMessageAt" >= NOW()',
    )

    const negated = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "interactedInLast24h",
            operator: operatorTypes.enum.eq,
            value: "false",
          },
        ],
      }),
    )
    expect(negated.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
  })

  test("renders tags isEmpty as NOT EXISTS ContactToTag", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [{ field: "tags", operator: operatorTypes.enum.isEmpty }],
      }),
    )

    expect(query.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactToTag"')
  })

  test("renders conversation-based conditions as EXISTS Conversation subqueries", () => {
    const archived = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "archived", operator: operatorTypes.enum.eq, value: "true" },
        ],
      }),
    )
    expect(archived.sql).toContain('EXISTS (SELECT 1 FROM "Conversation"')
    expect(archived.sql).toContain('"Conversation"."archivedAt" IS NOT NULL')

    const followUp = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "followUp", operator: operatorTypes.enum.eq, value: "true" },
        ],
      }),
    )
    expect(followUp.sql).toContain('"Conversation"."followed" =')

    const transferred = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "conversationTransferredToHuman",
            operator: operatorTypes.enum.eq,
            value: "true",
          },
        ],
      }),
    )
    expect(transferred.sql).toContain('"Conversation"."botEnabled" =')
  })

  test("parses conversation assignee sentinel and prefixed ids", () => {
    expect(
      parseConversationAssigneeValues([
        "unassigned",
        "u_123",
        "t_456",
        "u_not-a-number",
      ]),
    ).toEqual({
      hasUnassigned: true,
      userIds: ["123"],
      inboxTeamIds: ["456"],
    })
  })

  test("renders conversationAssigned with user, team, and unassigned branches", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "conversationAssigned",
            operator: operatorTypes.enum.in,
            value: ["u_123", "t_456", "unassigned"],
          },
        ],
      }),
    )

    expect(query.sql).toContain('EXISTS (SELECT 1 FROM "Conversation"')
    expect(query.sql).toContain('"Conversation"."assignedUserId" in')
    expect(query.sql).toContain('"Conversation"."assignedInboxTeamId" in')
    expect(query.sql).toContain('"Conversation"."assignedUserId" IS NULL')
    expect(query.sql).toContain('"Conversation"."assignedInboxTeamId" IS NULL')
    expect(query.params).toEqual(["123", "456"])
  })

  test("renders conversationAssigned negative and empty branches as NOT EXISTS", () => {
    const negative = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "conversationAssigned",
            operator: operatorTypes.enum.notIn,
            value: ["u_123"],
          },
        ],
      }),
    )
    expect(negative.sql).toContain('NOT EXISTS (SELECT 1 FROM "Conversation"')
    expect(negative.sql).toContain('"Conversation"."assignedUserId" in')

    const empty = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "conversationAssigned",
            operator: operatorTypes.enum.isEmpty,
          },
        ],
      }),
    )
    expect(empty.sql).toContain('NOT EXISTS (SELECT 1 FROM "Conversation"')
    expect(empty.sql).toContain('"Conversation"."assignedUserId" IS NOT NULL')
    expect(empty.sql).toContain(
      '"Conversation"."assignedInboxTeamId" IS NOT NULL',
    )
  })

  test("renders unread and unreplied as boolean EXISTS predicates", () => {
    const unread = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "unread", operator: operatorTypes.enum.eq, value: "true" },
        ],
      }),
    )
    expect(unread.sql).toContain('EXISTS (SELECT 1 FROM "Conversation"')
    expect(unread.sql).toContain('"Conversation"."lastActivityAt" IS NOT NULL')
    expect(unread.sql).toContain('"Conversation"."agentLastReadAt" IS NULL')
    expect(unread.sql).toContain(
      '"Conversation"."lastActivityAt" > "Conversation"."agentLastReadAt"',
    )

    const unreplied = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "unreplied",
            operator: operatorTypes.enum.eq,
            value: "true",
          },
        ],
      }),
    )
    expect(unreplied.sql).toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(unreplied.sql).toContain(
      '"ContactInbox"."lastIncomingMessageAt" IS NOT NULL',
    )
    expect(unreplied.sql).toContain(
      '"ContactInbox"."lastOutboundMessageAt" IS NULL',
    )
    expect(unreplied.sql).toContain(
      '"ContactInbox"."lastIncomingMessageAt" > "ContactInbox"."lastOutboundMessageAt"',
    )
  })

  test("renders existingContact as email-or-phone boolean predicate", () => {
    const positive = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "existingContact",
            operator: operatorTypes.enum.eq,
            value: "true",
          },
        ],
      }),
    )
    expect(positive.sql).toContain('"Contact"."email" IS NOT NULL')
    expect(positive.sql).toContain('"Contact"."phoneNumber" IS NOT NULL')
    expect(positive.sql).not.toContain("NOT (")

    const negative = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "existingContact",
            operator: operatorTypes.enum.eq,
            value: "false",
          },
        ],
      }),
    )
    expect(negative.sql).toContain("NOT (")
    expect(negative.sql).toContain('"Contact"."email" IS NOT NULL')
    expect(negative.sql).toContain('"Contact"."phoneNumber" IS NOT NULL')
  })

  test("renders hasContactInfo presence predicate for the selected info types", () => {
    const phoneOnly = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "hasContactInfo",
            operator: operatorTypes.enum.in,
            value: ["phone"],
          },
        ],
      }),
    )
    expect(phoneOnly.sql).toContain('"Contact"."phoneNumber" IS NOT NULL')
    expect(phoneOnly.sql).not.toContain('"Contact"."email"')

    const phoneOrEmail = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "hasContactInfo",
            operator: operatorTypes.enum.in,
            value: ["phone", "email"],
          },
        ],
      }),
    )
    expect(phoneOrEmail.sql).toContain('"Contact"."phoneNumber" IS NOT NULL')
    expect(phoneOrEmail.sql).toContain('"Contact"."email" IS NOT NULL')
    expect(phoneOrEmail.sql).toContain(" OR ")
  })

  test("renders hasContactInfo phoneAndEmail as a phone AND email presence predicate", () => {
    const hasBoth = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "hasContactInfo",
            operator: operatorTypes.enum.in,
            value: ["phoneAndEmail"],
          },
        ],
      }),
    )
    expect(hasBoth.sql).toContain('"Contact"."phoneNumber" IS NOT NULL')
    expect(hasBoth.sql).toContain('"Contact"."email" IS NOT NULL')
    expect(hasBoth.sql).toContain(" AND ")
    expect(hasBoth.sql).not.toContain(" OR ")

    const lacksBoth = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "hasContactInfo",
            operator: operatorTypes.enum.notIn,
            value: ["phoneAndEmail"],
          },
        ],
      }),
    )
    expect(lacksBoth.sql).toContain("NOT (")
    expect(lacksBoth.sql).toContain('"Contact"."phoneNumber" IS NOT NULL')
    expect(lacksBoth.sql).toContain('"Contact"."email" IS NOT NULL')
    expect(lacksBoth.sql).toContain(" AND ")
  })

  test("renders NULL-safe negation for hasContactInfo notIn and isEmpty", () => {
    const lacksEmail = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "hasContactInfo",
            operator: operatorTypes.enum.notIn,
            value: ["email"],
          },
        ],
      }),
    )
    expect(lacksEmail.sql).toContain("NOT (")
    expect(lacksEmail.sql).toContain('"Contact"."email" IS NOT NULL')
    expect(lacksEmail.sql).not.toContain('"Contact"."phoneNumber"')

    const lacksBoth = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "hasContactInfo",
            operator: operatorTypes.enum.isEmpty,
          },
        ],
      }),
    )
    expect(lacksBoth.sql).toContain("NOT (")
    expect(lacksBoth.sql).toContain('"Contact"."email" IS NOT NULL')
    expect(lacksBoth.sql).toContain('"Contact"."phoneNumber" IS NOT NULL')
  })

  test("ignores hasContactInfo conditions with unknown info types", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "hasContactInfo",
          operator: operatorTypes.enum.in,
          value: ["whatsapp"],
        },
      ],
    })

    expect(where).toEqual({})
  })

  test("renders continent country-code expansion and unknown sentinel", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "continent",
            operator: operatorTypes.enum.eq,
            value: ["AS", "unknown"],
          },
        ],
      }),
    )

    expect(query.sql).toContain('"Contact"."country" in')
    expect(query.sql).toContain('"Contact"."country" IS NULL')
    expect(query.sql).toContain('"Contact"."country" =')
    expect(query.sql).toContain('NOT ("Contact"."country" in')
    expect(query.params).toContain("VN")
  })

  test("renders lastComment text filters through ContactInbox and Message", () => {
    const containsQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastComment",
            operator: operatorTypes.enum.contains,
            value: "Need_%help\\",
          },
        ],
      }),
    )
    const equalQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastComment",
            operator: operatorTypes.enum.eq,
            value: "Exact_%comment\\",
          },
        ],
      }),
    )

    expect(containsQuery.sql).toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(containsQuery.sql).toContain('FROM "Message"')
    expect(containsQuery.sql).toContain('"ContactInbox"."lastCommentMessageId"')
    expect(containsQuery.sql).toContain("CASE")
    expect(containsQuery.sql).toContain("^[0-9]+$")
    expect(containsQuery.sql).toContain("::bigint")
    expect(containsQuery.sql).toContain('"Message"."text" ILIKE')
    expect(containsQuery.params).toContain("%Need\\_\\%help\\\\%")
    expect(equalQuery.params).toContain("Exact\\_\\%comment\\\\")
  })

  test("renders lastComment negative and empty operators with expected EXISTS semantics", () => {
    const notContainsQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastComment",
            operator: operatorTypes.enum.notContains,
            value: "spam",
          },
        ],
      }),
    )
    const notEqualQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastComment",
            operator: operatorTypes.enum.ne,
            value: "spam",
          },
        ],
      }),
    )
    const emptyQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "lastComment", operator: operatorTypes.enum.isEmpty },
        ],
      }),
    )
    const notEmptyQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "lastComment", operator: operatorTypes.enum.isNotEmpty },
        ],
      }),
    )

    expect(notContainsQuery.sql).toContain(
      'NOT EXISTS (SELECT 1 FROM "ContactInbox"',
    )
    expect(notContainsQuery.sql).toContain('"Message"."text" ILIKE')
    expect(notEqualQuery.sql).toContain(
      'NOT EXISTS (SELECT 1 FROM "ContactInbox"',
    )
    expect(notEqualQuery.sql).toContain('"Message"."text" ILIKE')
    expect(emptyQuery.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(emptyQuery.sql).toContain(
      '"ContactInbox"."lastCommentMessageId" IS NOT NULL',
    )
    expect(notEmptyQuery.sql).toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
  })

  test("ignores lastComment value operators with empty values", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "lastComment",
          operator: operatorTypes.enum.contains,
          value: "",
        },
      ],
    })

    expect(where).toEqual({})
  })

  test("renders lastSent as latest outbound contact-inbox datetime", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastSent",
            operator: operatorTypes.enum.eq,
            value: "2026-05-19T10:00:00Z",
          },
        ],
      }),
    )

    expect(query.sql).toContain('MAX("ContactInbox"."lastOutboundMessageAt")')
    expect(query.sql).not.toContain("date_trunc")
    // Second-precision eq -> a one-second window, matching the column path.
    expect(query.params).toEqual(
      expect.arrayContaining([
        "2026-05-19T10:00:00.000Z",
        "2026-05-19T10:00:01.000Z",
      ]),
    )
  })

  test("maps minutes-ago comparison directions to timestamp boundaries", () => {
    const atLeast = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "contactCreatedDateMinutesAgo",
            operator: operatorTypes.enum.gte,
            value: "30",
          },
        ],
      }),
    )
    expect(atLeast.sql).toContain(
      '"Contact"."createdAt" <= NOW() - make_interval',
    )
    expect(atLeast.params).toEqual([30])

    const lessThan = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastSeenMinutesAgo",
            operator: operatorTypes.enum.lt,
            value: "15",
          },
        ],
      }),
    )
    // lastSeen resolves to the latest read time across the contact's inboxes
    // (MAX(ContactInbox.contactLastReadAt)), not the dead Contact.lastReadAt.
    expect(lessThan.sql).toContain('MAX("ContactInbox"."contactLastReadAt")')
    expect(lessThan.sql).toContain("NOW() - make_interval")
    expect(lessThan.sql).not.toContain('"Contact"."lastReadAt"')
    expect(lessThan.params).toEqual([15])
  })

  test("renders minutes-ago between with inverted newer and older bounds", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "contactCreatedDateMinutesAgo",
            operator: operatorTypes.enum.isBetween,
            value: ["5", "30"],
          },
        ],
      }),
    )

    expect(query.sql).toContain(
      '"Contact"."createdAt" >= NOW() - make_interval',
    )
    expect(query.sql).toContain(
      '"Contact"."createdAt" <= NOW() - make_interval',
    )
    expect(query.params).toEqual([30, 5])
  })

  test("renders latest interaction minutes ago against max incoming message", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastInteractionMinutesAgo",
            operator: operatorTypes.enum.gt,
            value: "60",
          },
        ],
      }),
    )

    expect(query.sql).toContain('MAX("ContactInbox"."lastIncomingMessageAt")')
    expect(query.sql).toContain(
      '"latestInteraction"."latest" < NOW() - make_interval',
    )
    expect(query.params).toEqual([60])
  })

  test("renders consecutiveAiFailures as latest numeric aggregate", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "consecutiveAiFailures",
            operator: operatorTypes.enum.gt,
            value: "2",
          },
        ],
      }),
    )

    expect(query.sql).toContain('MAX("ContactInbox"."consecutiveFailedReply")')
    expect(query.sql).toContain('"latestInteraction"."latest" >')
    expect(query.params).toEqual([2])
  })

  test("maps boolean field operators to boolean/timestamp predicates", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "emailWasVerified",
            operator: operatorTypes.enum.eq,
            value: "true",
          },
        ],
      }),
    ).toEqual({
      AND: [{ emailVerified: true }],
    })

    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "subscribedToBroadcast",
            operator: operatorTypes.enum.eq,
            value: "false",
          },
        ],
      }),
    ).toEqual({
      AND: [{ broadcastSubscribedAt: { isNull: true } }],
    })
  })

  test("renders static datetime equality at the typed precision", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "contactCreatedAt",
          operator: operatorTypes.enum.eq,
          value: "2026-05-19T10:00:00Z",
        },
      ],
    })

    const query = renderContactWhere(where)

    // A second-precision value matches its own one-second window [t, t+1s),
    // not the whole day — same convention as datetime custom fields.
    expect(query.sql).toContain('"Contact"."createdAt" >=')
    expect(query.sql).toContain('"Contact"."createdAt" <')
    expect(query.sql).not.toContain("date_trunc")
    expect(query.params).toEqual([
      "2026-05-19T10:00:00.000Z",
      "2026-05-19T10:00:01.000Z",
    ])
  })

  test("renders a static date-only equality as a full-day range", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "contactCreatedAt",
          operator: operatorTypes.enum.eq,
          value: "2026-05-19",
        },
      ],
    })

    const query = renderContactWhere(where)

    // No time typed -> day precision -> the whole [00:00, next-00:00) day.
    expect(query.params).toEqual([
      "2026-05-19T00:00:00.000Z",
      "2026-05-20T00:00:00.000Z",
    ])
  })

  test("renders static date intervals with supported SQL", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "lastSeen",
          operator: operatorTypes.enum.isBetween,
          value: ["2026-05-01T00:00:00Z", "2026-05-31T23:59:59Z"],
        },
      ],
    })

    const query = renderContactWhere(where)

    // lastSeen aggregates over the contact's inboxes; half-open [loStart, hiEnd):
    // the To bound extends to the end of the typed precision unit (23:59:59 ->
    // +1s), so the upper comparison is `<`, never the inclusive `<=` that
    // silently dropped the final second.
    expect(query.sql).toContain('MAX("ContactInbox"."contactLastReadAt")')
    expect(query.sql).not.toContain('"Contact"."lastReadAt"')
    expect(query.sql).not.toContain("<=")
    expect(query.sql).toContain("::timestamptz")
    expect(query.params).toEqual([
      "2026-05-01T00:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
    ])
  })

  test("extends an isBetween To bound to the end of the typed precision unit", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        timezone: "Asia/Ho_Chi_Minh",
        conditions: [
          {
            field: "lastSeen",
            operator: operatorTypes.enum.isBetween,
            value: ["2026-07-01 09:00", "2026-07-01 09:00"],
          },
        ],
      }),
    )

    // From == To at minute precision spans the whole 09:00 minute:
    // [09:00:00 +07, 09:01:00 +07) === [02:00:00Z, 02:01:00Z).
    expect(query.params).toEqual([
      "2026-07-01T02:00:00.000Z",
      "2026-07-01T02:01:00.000Z",
    ])
  })

  test("renders static date notBetween with supported SQL", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "lastSeen",
          operator: operatorTypes.enum.notBetween,
          value: ["2026-05-01T00:00:00Z", "2026-05-31T23:59:59Z"],
        },
      ],
    })

    const query = renderContactWhere(where)

    // Null-safe negation over the aggregate: before loStart, at/after hiEnd, or
    // no read time at all (NULL). NULL rows must survive notBetween.
    expect(query.sql).toContain('MAX("ContactInbox"."contactLastReadAt")')
    expect(query.sql).not.toContain('"Contact"."lastReadAt"')
    expect(query.sql).toContain("IS NULL")
    expect(query.sql).toContain("::timestamptz")
  })

  test("ignores static date intervals with invalid values", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "lastSeen",
          operator: operatorTypes.enum.isBetween,
          value: ["not-a-date", "2026-05-31T23:59:59Z"],
        },
      ],
    })

    expect(where).toEqual({})
  })

  test("interprets a naive date equality in the supplied timezone (UTC+7)", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        timezone: "Asia/Ho_Chi_Minh",
        conditions: [
          {
            field: "contactCreatedAt",
            operator: operatorTypes.enum.eq,
            value: "2026-07-20",
          },
        ],
      }),
    )

    // 2026-07-20 00:00 +07 === 2026-07-19T17:00Z; next day 00:00 +07 === 2026-07-20T17:00Z
    expect(query.sql).not.toContain("date_trunc")
    expect(query.params).toEqual([
      "2026-07-19T17:00:00.000Z",
      "2026-07-20T17:00:00.000Z",
    ])
  })

  test("interprets a naive datetime gt in the supplied timezone (UTC+7)", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        timezone: "Asia/Ho_Chi_Minh",
        conditions: [
          {
            field: "lastSeen",
            operator: operatorTypes.enum.gt,
            value: "2026-07-20 14:30",
          },
        ],
      }),
    )

    // gt means "strictly after the whole typed unit", so it pins to the END of
    // the 14:30 minute: 2026-07-20 14:31 +07 === 2026-07-20T07:31Z.
    expect(query.sql).toContain('MAX("ContactInbox"."contactLastReadAt")')
    expect(query.sql).not.toContain('"Contact"."lastReadAt"')
    expect(query.params).toEqual(["2026-07-20T07:31:00.000Z"])
  })

  test("interprets a naive datetime range in the supplied timezone (UTC+7)", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        timezone: "Asia/Ho_Chi_Minh",
        conditions: [
          {
            field: "lastInteraction",
            operator: operatorTypes.enum.isBetween,
            value: ["2026-07-01 00:00", "2026-07-31 23:59"],
          },
        ],
      }),
    )

    expect(query.sql).toContain('MAX("ContactInbox"."lastIncomingMessageAt")')
    // The To bound "2026-07-31 23:59" extends to the end of that minute
    // (23:59 -> +1min -> next-day 00:00 +07 === 2026-07-31T17:00Z).
    expect(query.params).toEqual(
      expect.arrayContaining([
        "2026-06-30T17:00:00.000Z",
        "2026-07-31T17:00:00.000Z",
      ]),
    )
  })

  test("defaults date filters to UTC when no timezone is supplied", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "contactCreatedAt",
            operator: operatorTypes.enum.eq,
            value: "2026-07-20",
          },
        ],
      }),
    )

    expect(query.params).toEqual([
      "2026-07-20T00:00:00.000Z",
      "2026-07-21T00:00:00.000Z",
    ])
  })

  test("uses an explicit offset in the value over the supplied timezone", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        timezone: "Asia/Ho_Chi_Minh",
        conditions: [
          {
            field: "lastSeen",
            operator: operatorTypes.enum.gt,
            value: "2026-07-20T14:30:00+00:00",
          },
        ],
      }),
    )

    // explicit +00:00 offset is honored, not re-interpreted in +07; gt pins to
    // the end of the typed second (14:30:00 -> +1s -> 14:30:01Z).
    expect(query.params).toEqual(["2026-07-20T14:30:01.000Z"])
  })

  test("falls back to UTC for an unrecognized timezone", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        timezone: "Not/AZone",
        conditions: [
          {
            field: "contactCreatedAt",
            operator: operatorTypes.enum.eq,
            value: "2026-07-20",
          },
        ],
      }),
    )

    expect(query.params).toEqual([
      "2026-07-20T00:00:00.000Z",
      "2026-07-21T00:00:00.000Z",
    ])
  })

  test("applies the criteria timezone to custom-field dates", () => {
    const where = applyContactFilter({
      operator: "and",
      timezone: "Asia/Ho_Chi_Minh",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.eq,
          value: "2026-07-20",
        },
      ],
    })

    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("::timestamptz")
    expect(query.sql).not.toContain("date_trunc('day'")
    expect(query.params).toContain("2026-07-19T17:00:00.000Z")
    expect(query.params).toContain("2026-07-20T17:00:00.000Z")
  })

  test("compares a custom-field date with time by wall clock, ignoring the criteria timezone", () => {
    // A DATE field filters exactly what the user typed. "2026-07-20 09:30" has
    // no offset, so the VN criteria timezone must NOT shift it: match the 09:30
    // minute window in wall clock (::timestamp), not 02:30Z.
    const where = applyContactFilter({
      operator: "and",
      timezone: "Asia/Ho_Chi_Minh",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          customFieldType: "date",
          operator: operatorTypes.enum.eq,
          value: "2026-07-20 09:30",
        },
      ],
    })

    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("::timestamp")
    expect(query.sql).not.toContain("::timestamptz")
    expect(query.sql).not.toContain("left(")
    expect(query.params).toContain("2026-07-20T09:30:00")
    expect(query.params).toContain("2026-07-20T09:31:00")
    expect(query.params).not.toContain("2026-07-20T02:30:00.000Z")
  })

  test.each([
    {
      name: "day precision when only a date is typed",
      timezone: "UTC",
      value: "2026-05-19",
      start: "2026-05-19T00:00:00.000Z",
      end: "2026-05-20T00:00:00.000Z",
    },
    {
      name: "minute precision when a time is typed",
      timezone: "UTC",
      value: "2026-05-19 10:00",
      start: "2026-05-19T10:00:00.000Z",
      end: "2026-05-19T10:01:00.000Z",
    },
    {
      name: "second precision when seconds are typed",
      timezone: "UTC",
      value: "2026-05-19T10:00:30Z",
      start: "2026-05-19T10:00:30.000Z",
      end: "2026-05-19T10:00:31.000Z",
    },
    {
      name: "minute precision anchored to the criteria timezone",
      timezone: "Asia/Ho_Chi_Minh",
      value: "2026-05-19 10:00",
      start: "2026-05-19T03:00:00.000Z",
      end: "2026-05-19T03:01:00.000Z",
    },
  ])("guards a datetime custom-field cast and matches equality by the typed precision window: $name", ({
    timezone,
    value,
    start,
    end,
  }) => {
    const where = applyContactFilter({
      operator: "and",
      timezone,
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.eq,
          value,
        },
      ],
    })

    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("CASE WHEN")
    expect(query.sql).toContain("NULLIF")
    expect(query.sql).toContain("::timestamptz")
    expect(query.sql).not.toContain("date_trunc('day'")
    expect(query.sql).not.toContain("INTERVAL '1 day'")
    expect(query.params).toContain(start)
    expect(query.params).toContain(end)
  })

  test("renders numeric custom-field ranges with numeric guard", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "number",
          operator: operatorTypes.enum.isBetween,
          value: ["10", "20"],
        },
      ],
    })

    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("EXISTS")
    expect(query.sql).toContain("::numeric")
    expect(query.sql).toContain("~")
    expect(query.sql).toContain(">=")
    expect(query.sql).toContain("<=")
    expect(query.params).toEqual(["cf-1", 10, 20])
  })

  test("renders datetime custom-field ranges with guarded timestamptz casts", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.isBetween,
          value: ["2026-05-01T00:00:00Z", "2026-05-31T23:59:59Z"],
        },
      ],
    })

    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("CASE WHEN")
    expect(query.sql).toContain("::timestamptz")
    expect(query.sql).toContain(">=")
    expect(query.sql).toContain("<")
  })

  test("ignores datetime custom-field conditions with invalid input", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.eq,
          value: "not-a-date",
        },
      ],
    })

    expect(where).toEqual({})
  })

  test("ignores unsupported custom-field operator/type combinations", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.contains,
          value: "2026",
        },
      ],
    })

    expect(where).toEqual({})
  })

  test("ANDs keyword search with OR contact filter without overwriting either OR", () => {
    const where = buildContactWhere({
      workspaceId: "ws-1",
      keyword: "Acme",
      contactFilter: {
        operator: "or",
        conditions: [
          {
            field: "fullName",
            operator: operatorTypes.enum.contains,
            value: "bob",
          },
        ],
      },
    })

    const query = renderContactWhere(where)

    expect(query.sql).toContain('"Contact"."workspaceId" =')
    expect(query.sql.toLowerCase()).toContain('"contact"."firstname" ilike')
    expect(query.sql.toLowerCase()).toContain('"contact"."lastname" ilike')
    expect(query.sql).toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(query.sql).toContain('"ContactInbox"."sourceId" =')
    expect(query.sql.toLowerCase()).toContain('"contact"."fullname" ilike')
    expect(query.sql.toLowerCase()).not.toContain('"contact"."email" ilike')
    expect(query.sql.toLowerCase()).not.toContain(
      '"contact"."phonenumber" ilike',
    )
    expect(query.params).toEqual(["ws-1", "%acme%", "%acme%", "Acme", "%bob%"])
  })

  test("builds contact-inbox audience SQL from a contact-rooted filter", () => {
    const query = new PgDialect().sqlToQuery(
      buildContactInboxContactFilterSQL({
        contactIdColumn: contactInboxModel.contactId,
        workspaceId: "ws-1",
        contactFilter: {
          operator: "and",
          conditions: [
            {
              field: "fullName",
              operator: operatorTypes.enum.contains,
              value: "Ada",
            },
          ],
        },
      }),
    )

    expect(query.sql).toContain('"ContactInbox"."contactId" IN')
    expect(query.sql).toContain('SELECT "Contact"."id" FROM "Contact"')
    expect(query.sql).toContain('"Contact"."workspaceId" =')
    expect(query.sql.toLowerCase()).toContain('"contact"."fullname" ilike')
    expect(query.params).toEqual(["ws-1", "%Ada%"])
  })

  test("preserves empty audience filters as TRUE", () => {
    const query = new PgDialect().sqlToQuery(
      buildContactInboxContactFilterSQL({
        contactIdColumn: contactInboxModel.contactId,
        workspaceId: "ws-1",
        contactFilter: {
          operator: "and",
          conditions: [],
        },
      }),
    )

    expect(query.sql).toBe("TRUE")
    expect(query.params).toEqual([])
  })

  test("turns all-unknown audience filters into FALSE", () => {
    const query = new PgDialect().sqlToQuery(
      buildContactInboxContactFilterSQL({
        contactIdColumn: contactInboxModel.contactId,
        workspaceId: "ws-1",
        contactFilter: {
          operator: "and",
          conditions: [
            {
              field: "deletedCustomField",
              operator: operatorTypes.enum.eq,
              value: "x",
            },
          ],
        },
      }),
    )

    expect(query.sql).toBe("FALSE")
    expect(query.params).toEqual([])
  })
})

// ── Full field × operator coverage ─────────────────────────────────────────────

const firstAnd = (
  field: string,
  operator: string,
  value?: unknown,
): Record<string, unknown> => {
  const where = applyContactFilter({
    operator: "and",
    conditions: [
      value === undefined ? { field, operator } : { field, operator, value },
    ],
  }) as { AND?: Record<string, unknown>[] }
  return where.AND?.[0] ?? (where as Record<string, unknown>)
}

describe("applyContactFilter — direct column fields", () => {
  test.each([
    ["gender", "gender"],
    ["country", "country"],
    ["locale", "locale"],
    ["timezone", "timezone"],
  ])("maps %s eq to the %s column", (field, column) => {
    expect(firstAnd(field, operatorTypes.enum.eq, "x")).toEqual({
      [column]: "x",
    })
  })

  test.each([
    ["fullName", "fullName"],
    ["email", "email"],
    ["phone", "phoneNumber"],
  ])("maps %s eq to case-insensitive %s SQL", (field, column) => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [{ field, operator: operatorTypes.enum.eq, value: "x" }],
      }),
    )

    expect(query.sql.toLowerCase()).toContain(
      `"contact"."${column.toLowerCase()}" ilike`,
    )
    expect(query.params).toContain("x")
  })

  test.each([
    [operatorTypes.enum.eq, ["a", "b"], { fullName: { in: ["a", "b"] } }],
    [
      operatorTypes.enum.ne,
      ["a"],
      {
        OR: [{ fullName: { notIn: ["a"] } }, { fullName: { isNull: true } }],
      },
    ],
    [operatorTypes.enum.in, ["a", "b"], { fullName: { in: ["a", "b"] } }],
    [
      operatorTypes.enum.notIn,
      ["a"],
      {
        OR: [{ fullName: { notIn: ["a"] } }, { fullName: { isNull: true } }],
      },
    ],
    [operatorTypes.enum.contains, "ad", { fullName: { ilike: "%ad%" } }],
    [
      operatorTypes.enum.notContains,
      "ad",
      {
        OR: [
          { fullName: { notIlike: "%ad%" } },
          { fullName: { isNull: true } },
        ],
      },
    ],
    [operatorTypes.enum.gt, "M", { fullName: { gt: "M" } }],
    [operatorTypes.enum.gte, "M", { fullName: { gte: "M" } }],
    [operatorTypes.enum.lt, "M", { fullName: { lt: "M" } }],
    [operatorTypes.enum.lte, "M", { fullName: { lte: "M" } }],
  ])("maps fullName operator %s", (operator, value, expected) => {
    expect(firstAnd("fullName", operator, value)).toEqual(expected)
  })

  test.each([
    [operatorTypes.enum.eq, "Ada", '"contact"."fullname" ilike'],
    [operatorTypes.enum.ne, "Ada", '"contact"."fullname" not ilike'],
  ])("maps fullName operator %s as case-insensitive SQL", (operator, value, expected) => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [{ field: "fullName", operator, value }],
      }),
    )

    expect(query.sql.toLowerCase()).toContain(expected)
    expect(query.params).toContain(value)
  })

  test.each([
    [
      operatorTypes.enum.isEmpty,
      { OR: [{ fullName: { isNull: true } }, { fullName: "" }] },
    ],
    [
      operatorTypes.enum.isNotEmpty,
      {
        AND: [{ fullName: { isNotNull: true } }, { fullName: { ne: "" } }],
      },
    ],
  ])("maps fullName %s to include empty strings", (operator, expected) => {
    expect(firstAnd("fullName", operator)).toEqual(expected)
  })

  test.each([
    ["gender", "gender"],
    ["country", "country"],
    ["locale", "locale"],
    ["timezone", "timezone"],
  ])("includes NULL rows for %s negation operators", (field, column) => {
    expect(firstAnd(field, operatorTypes.enum.ne, "x")).toEqual({
      OR: [{ [column]: { ne: "x" } }, { [column]: { isNull: true } }],
    })
    expect(firstAnd(field, operatorTypes.enum.notContains, "x")).toEqual({
      OR: [{ [column]: { notIlike: "%x%" } }, { [column]: { isNull: true } }],
    })
  })

  test.each([
    ["fullName", "fullName"],
    ["email", "email"],
    ["phone", "phoneNumber"],
  ])("includes NULL rows for %s case-insensitive ne", (field, column) => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [{ field, operator: operatorTypes.enum.ne, value: "x" }],
      }),
    )

    expect(query.sql.toLowerCase()).toContain(
      `"contact"."${column.toLowerCase()}" not ilike`,
    )
    expect(query.sql.toLowerCase()).toContain(
      `"contact"."${column.toLowerCase()}" is null`,
    )
  })

  test.each([
    ["fullName", "fullName"],
    ["email", "email"],
    ["phone", "phoneNumber"],
  ])("includes NULL rows for %s notContains", (field, column) => {
    expect(firstAnd(field, operatorTypes.enum.notContains, "x")).toEqual({
      OR: [{ [column]: { notIlike: "%x%" } }, { [column]: { isNull: true } }],
    })
  })

  test("does not compare the gender enum to an empty string", () => {
    expect(firstAnd("gender", operatorTypes.enum.isEmpty)).toEqual({
      gender: { isNull: true },
    })
    expect(firstAnd("gender", operatorTypes.enum.isNotEmpty)).toEqual({
      gender: { isNotNull: true },
    })
  })

  test("renders startsWith / endsWith as anchored ILIKE", () => {
    const starts = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "fullName",
            operator: operatorTypes.enum.startsWith,
            value: "Ad",
          },
        ],
      }),
    )
    expect(starts.sql.toLowerCase()).toContain('"contact"."fullname" ilike')
    expect(starts.params).toContain("Ad%")

    const ends = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "email",
            operator: operatorTypes.enum.endsWith,
            value: "@acme.com",
          },
        ],
      }),
    )
    expect(ends.params).toContain("%@acme.com")
  })

  test("drops isBetween/notBetween for non-date columns", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "fullName",
            operator: operatorTypes.enum.isBetween,
            value: ["a", "b"],
          },
        ],
      }),
    ).toEqual({})
  })
})

describe("applyContactFilter — boolean columns", () => {
  test.each([
    ["emailWasVerified", "emailVerified"],
    ["optedInForEmail", "emailOptIn"],
  ])("maps %s eq true/false + isEmpty to %s", (field, column) => {
    expect(firstAnd(field, operatorTypes.enum.eq, "true")).toEqual({
      [column]: true,
    })
    expect(firstAnd(field, operatorTypes.enum.eq, "false")).toEqual({
      [column]: false,
    })
    expect(firstAnd(field, operatorTypes.enum.isEmpty)).toEqual({
      [column]: { isNull: true },
    })
  })
})

describe("applyContactFilter — boolean-from-timestamp columns", () => {
  test.each([
    ["subscribedToBroadcast", "broadcastSubscribedAt"],
    ["blocked", "blockedAt"],
  ])("maps %s to %s null-checks", (field, column) => {
    expect(firstAnd(field, operatorTypes.enum.eq, "true")).toEqual({
      [column]: { isNotNull: true },
    })
    expect(firstAnd(field, operatorTypes.enum.eq, "false")).toEqual({
      [column]: { isNull: true },
    })
    expect(firstAnd(field, operatorTypes.enum.isEmpty)).toEqual({
      [column]: { isNull: true },
    })
    expect(firstAnd(field, operatorTypes.enum.isNotEmpty)).toEqual({
      [column]: { isNotNull: true },
    })
  })
})

describe("applyContactFilter — date columns", () => {
  test.each([
    ["contactCreatedAt", "createdAt"],
  ])("maps %s isEmpty/isNotEmpty to %s null-checks", (field, column) => {
    expect(firstAnd(field, operatorTypes.enum.isEmpty)).toEqual({
      [column]: { isNull: true },
    })
    expect(firstAnd(field, operatorTypes.enum.isNotEmpty)).toEqual({
      [column]: { isNotNull: true },
    })
  })

  test("maps lastSeen isEmpty/isNotEmpty to a ContactInbox aggregate null-check", () => {
    const empty = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "lastSeen", operator: operatorTypes.enum.isEmpty },
        ],
      }),
    )
    expect(empty.sql).toContain('MAX("ContactInbox"."contactLastReadAt")')
    expect(empty.sql).toContain("IS NULL")
    expect(empty.sql).not.toContain('"Contact"."lastReadAt"')

    const notEmpty = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "lastSeen", operator: operatorTypes.enum.isNotEmpty },
        ],
      }),
    )
    expect(notEmpty.sql).toContain('MAX("ContactInbox"."contactLastReadAt")')
    expect(notEmpty.sql).toContain("IS NOT NULL")
    expect(notEmpty.sql).not.toContain('"Contact"."lastReadAt"')
  })

  test("renders ne as an outside-the-precision-window range", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "contactCreatedAt",
            operator: operatorTypes.enum.ne,
            value: "2026-05-19T10:00:00Z",
          },
        ],
      }),
    )
    // Null-safe negation of the one-second window: before start, at/after end,
    // or NULL. NULL rows must survive `ne`, which raw SQL `<>` would drop.
    expect(query.sql).toContain('"Contact"."createdAt" <')
    expect(query.sql).toContain('"Contact"."createdAt" >=')
    expect(query.sql).toContain('"Contact"."createdAt" IS NULL')
    expect(query.sql).not.toContain("date_trunc")
    expect(query.params).toEqual([
      "2026-05-19T10:00:00.000Z",
      "2026-05-19T10:00:01.000Z",
    ])
  })

  test.each([
    operatorTypes.enum.gt,
    operatorTypes.enum.gte,
    operatorTypes.enum.lt,
    operatorTypes.enum.lte,
  ])("renders %s as a timestamptz comparison", (operator) => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "contactCreatedAt",
            operator,
            value: "2026-05-19T10:00:00Z",
          },
        ],
      }),
    )
    expect(query.sql).toContain('"Contact"."createdAt"')
    expect(query.sql).toContain("::timestamptz")
  })

  test("drops invalid single date values", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastSeen",
            operator: operatorTypes.enum.gt,
            value: "not-a-date",
          },
        ],
      }),
    ).toEqual({})
  })
})

describe("applyContactFilter — contactInbox relation fields", () => {
  test.each([
    ["currentChannel", "channel"],
    ["inbox", "inboxId"],
    ["language", "language"],
    ["source", "source"],
  ])("renders all supported %s operators as EXISTS on ContactInbox.%s", (field, column) => {
    for (const operator of [operatorTypes.enum.in, operatorTypes.enum.eq]) {
      const query = renderContactWhere(
        applyContactFilter({
          operator: "and",
          conditions: [{ field, operator, value: ["a"] }],
        }),
      )
      expect(query.sql).toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
      expect(query.sql).toContain(`"ContactInbox"."${column}" in`)
    }

    for (const operator of [operatorTypes.enum.notIn, operatorTypes.enum.ne]) {
      const query = renderContactWhere(
        applyContactFilter({
          operator: "and",
          conditions: [{ field, operator, value: ["a"] }],
        }),
      )
      expect(query.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
      expect(query.sql).toContain(`"ContactInbox"."${column}" in`)
      expect(query.sql).not.toContain(`"ContactInbox"."${column}" not in`)
    }

    const emptyQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [{ field, operator: operatorTypes.enum.isEmpty }],
      }),
    )
    expect(emptyQuery.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
  })

  test("renders language isEmpty as no ContactInbox with a non-empty language", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "language", operator: operatorTypes.enum.isEmpty },
        ],
      }),
    )

    expect(query.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(query.sql).toContain('"ContactInbox"."language" IS NOT NULL')
    expect(query.sql).toContain(`"ContactInbox"."language" <> ''`)
  })

  test("drops unsupported operators for relation fields", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "currentChannel",
            operator: operatorTypes.enum.contains,
            value: "x",
          },
        ],
      }),
    ).toEqual({})
  })

  test("renders interactedInLast24h true/false as EXISTS / NOT EXISTS", () => {
    const positive = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "interactedInLast24h",
            operator: operatorTypes.enum.eq,
            value: "true",
          },
        ],
      }),
    )
    expect(positive.sql).toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(positive.sql).toContain(
      '"ContactInbox"."lastIncomingMessageAt" >= NOW()',
    )

    const negative = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "interactedInLast24h",
            operator: operatorTypes.enum.eq,
            value: "false",
          },
        ],
      }),
    )
    expect(negative.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')

    const empty = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "interactedInLast24h",
            operator: operatorTypes.enum.isEmpty,
          },
        ],
      }),
    )
    expect(empty.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(empty.sql).toContain(
      '"ContactInbox"."lastIncomingMessageAt" >= NOW()',
    )
  })

  test("renders lastInteraction date filters against latest ContactInbox.lastIncomingMessageAt", () => {
    const eq = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastInteraction",
            operator: operatorTypes.enum.eq,
            value: "2026-05-19T10:00:00Z",
          },
        ],
      }),
    )
    expect(eq.sql).not.toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(eq.sql).toContain(
      'SELECT MAX("ContactInbox"."lastIncomingMessageAt")',
    )
    expect(eq.sql).toContain('"latestInteraction"."latest" >=')
    expect(eq.sql).not.toContain("date_trunc")
    // Aggregate path mirrors the column path: second-precision one-second window.
    expect(eq.params).toEqual([
      "2026-05-19T10:00:00.000Z",
      "2026-05-19T10:00:01.000Z",
    ])

    const ne = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastInteraction",
            operator: operatorTypes.enum.ne,
            value: "2026-05-19T10:00:00Z",
          },
        ],
      }),
    )
    expect(ne.sql).not.toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(ne.sql).toContain(
      'SELECT MAX("ContactInbox"."lastIncomingMessageAt")',
    )
    expect(ne.sql).toContain('"latestInteraction"."latest" >=')
    expect(ne.sql).toContain("IS NULL")

    const lt = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastInteraction",
            operator: operatorTypes.enum.lt,
            value: "2026-02-01T00:00:00Z",
          },
        ],
      }),
    )
    expect(lt.sql).toContain(
      'SELECT MAX("ContactInbox"."lastIncomingMessageAt")',
    )
    expect(lt.sql).toContain("<")

    const empty = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "lastInteraction", operator: operatorTypes.enum.isEmpty },
        ],
      }),
    )
    expect(empty.sql).not.toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(empty.sql).toContain(
      'SELECT MAX("ContactInbox"."lastIncomingMessageAt")',
    )
    expect(empty.sql).toContain('AS "latest"')
    expect(empty.sql).toContain("IS NULL")

    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastInteraction",
            operator: operatorTypes.enum.gt,
            value: "not-a-date",
          },
        ],
      }),
    ).toEqual({})
  })

  test("renders last user input filters against the latest inbound ContactInbox row", () => {
    const inputQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastUserInput",
            operator: operatorTypes.enum.contains,
            value: "invoice",
          },
        ],
      }),
    )

    expect(inputQuery.sql).toContain('SELECT "ContactInbox"."lastUserInput"')
    expect(inputQuery.sql).toContain(
      '"ContactInbox"."lastIncomingMessageAt" IS NOT NULL',
    )
    expect(inputQuery.sql).toContain(
      'ORDER BY "ContactInbox"."lastIncomingMessageAt" DESC',
    )
    expect(inputQuery.sql).toContain('"latestInteraction"."latest"::text ILIKE')
    expect(inputQuery.params).toContain("%invoice%")

    const typeQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastUserInputType",
            operator: operatorTypes.enum.eq,
            value: "image",
          },
        ],
      }),
    )

    expect(typeQuery.sql).toContain('SELECT "ContactInbox"."lastUserInputType"')
    expect(typeQuery.sql).toContain('"latestInteraction"."latest"::text ILIKE')
    expect(typeQuery.params).toContain("image")
  })
})

describe("applyContactFilter — CTWA fields", () => {
  test("renders fromCtwaAd true/false as EXISTS / NOT EXISTS on ContactInbox.referral", () => {
    const positive = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "fromCtwaAd",
            operator: operatorTypes.enum.eq,
            value: "true",
          },
        ],
      }),
    )
    expect(positive.sql).toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
    expect(positive.sql).toContain(
      `"ContactInbox"."referral"->>'ctwaClid' IS NOT NULL`,
    )
    expect(positive.sql).toContain(
      `"ContactInbox"."referral"->>'ctwaClid' <> ''`,
    )

    const negative = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "fromCtwaAd",
            operator: operatorTypes.enum.eq,
            value: "false",
          },
        ],
      }),
    )
    expect(negative.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')

    const empty = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "fromCtwaAd", operator: operatorTypes.enum.isEmpty },
        ],
      }),
    )
    expect(empty.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactInbox"')
  })

  test("renders ctwaConversion in/notIn as EXISTS/NOT EXISTS joining AdsConversionEvent through ContactInbox", () => {
    const inQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "ctwaConversion",
            operator: operatorTypes.enum.in,
            value: ["lead", "purchase"],
          },
        ],
      }),
    )
    expect(inQuery.sql).toContain('EXISTS (SELECT 1 FROM "AdsConversionEvent"')
    expect(inQuery.sql).toContain(
      'INNER JOIN "ContactInbox" ON "ContactInbox"."id" = "AdsConversionEvent"."contactInboxId"',
    )
    expect(inQuery.sql).toContain('"ContactInbox"."contactId" =')
    expect(inQuery.sql).toContain('"AdsConversionEvent"."eventType" in')
    expect(inQuery.params).toEqual(expect.arrayContaining(["lead", "purchase"]))

    const notInQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "ctwaConversion",
            operator: operatorTypes.enum.notIn,
            value: ["lead"],
          },
        ],
      }),
    )
    expect(notInQuery.sql).toContain(
      'NOT EXISTS (SELECT 1 FROM "AdsConversionEvent"',
    )
    expect(notInQuery.sql).toContain('"AdsConversionEvent"."eventType" in')
  })

  test("renders ctwaConversion isEmpty as NOT EXISTS with no eventType predicate", () => {
    const emptyQuery = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "ctwaConversion", operator: operatorTypes.enum.isEmpty },
        ],
      }),
    )
    expect(emptyQuery.sql).toContain(
      'NOT EXISTS (SELECT 1 FROM "AdsConversionEvent"',
    )
    expect(emptyQuery.sql).not.toContain('"AdsConversionEvent"."eventType"')
  })
})

describe("applyContactFilter — ctwaRetarget", () => {
  test("renders conversations segment as EXISTS on ContactInbox.firstInteractionAt, not event occurredAt", () => {
    const query = renderContactWhere(
      applyContactFilter(
        {
          operator: "and",
          conditions: [
            {
              field: "ctwaRetarget",
              segment: "conversations",
              adId: "ad-1",
              since: "2026-07-01",
              until: "2026-07-31",
            },
          ],
        },
        "ws-1",
      ),
    )

    expect(query.sql).toContain('EXISTS (SELECT 1 FROM "ContactInbox"')
    // Correlated on the outer contact id — the subquery must NOT re-join
    // "Contact" (that self-join would break correlation and over-match).
    expect(query.sql).toContain('"ContactInbox"."contactId" =')
    expect(query.sql).not.toContain(
      'INNER JOIN "Contact" ON "Contact"."id" = "ContactInbox"."contactId"',
    )
    expect(query.sql).toContain(
      `"ContactInbox"."referral"->>'ctwaClid' IS NOT NULL`,
    )
    expect(query.sql).toContain('"ContactInbox"."firstInteractionAt"')
    expect(query.sql).not.toContain('"AdsConversionEvent"."occurredAt"')
    expect(query.sql).toContain(`"ContactInbox"."referral"->>'adId' =`)
    expect(query.params).toEqual(
      expect.arrayContaining([
        "ad-1",
        "2026-07-01T00:00:00.000Z",
        "2026-07-31T23:59:59.999Z",
      ]),
    )
  })

  test("renders leads/purchases segments as EXISTS joining AdsConversionEvent through ContactInbox on the same row", () => {
    const leadsQuery = renderContactWhere(
      applyContactFilter(
        {
          operator: "and",
          conditions: [
            {
              field: "ctwaRetarget",
              segment: "leads",
              since: "2026-07-01",
              until: "2026-07-31",
            },
          ],
        },
        "ws-1",
      ),
    )
    expect(leadsQuery.sql).toContain(
      'EXISTS (SELECT 1 FROM "AdsConversionEvent"',
    )
    expect(leadsQuery.sql).toContain(
      'INNER JOIN "ContactInbox" ON "ContactInbox"."id" = "AdsConversionEvent"."contactInboxId"',
    )
    expect(leadsQuery.sql).toContain('"ContactInbox"."contactId" =')
    expect(leadsQuery.sql).toContain(`"AdsConversionEvent"."eventType" =`)
    expect(leadsQuery.params).toEqual(expect.arrayContaining(["lead", "ws-1"]))

    const purchasesQuery = renderContactWhere(
      applyContactFilter(
        {
          operator: "and",
          conditions: [
            {
              field: "ctwaRetarget",
              segment: "purchases",
              adId: "ad-2",
              since: "2026-07-01",
              until: "2026-07-31",
            },
          ],
        },
        "ws-1",
      ),
    )
    expect(purchasesQuery.params).toEqual(
      expect.arrayContaining(["purchase", "ad-2", "ws-1"]),
    )
  })

  test("scopes conversations to the WhatsApp integration for parity with the Facebook path", () => {
    const query = renderContactWhere(
      applyContactFilter(
        {
          operator: "and",
          conditions: [
            {
              field: "ctwaRetarget",
              segment: "conversations",
              integrationWhatsappId: "iw-1",
              since: "2026-07-01",
              until: "2026-07-31",
            },
          ],
        },
        "ws-1",
      ),
    )
    // Correlated existence on the integration's inbox — a contact whose CTWA
    // conversation lives on a different integration must not match.
    expect(query.sql).toContain('EXISTS (SELECT 1 FROM "IntegrationWhatsapp"')
    expect(query.sql).toContain(
      '"IntegrationWhatsapp"."inboxId" = "ContactInbox"."inboxId"',
    )
    expect(query.params).toEqual(expect.arrayContaining(["iw-1", "ws-1"]))
  })

  test("scopes leads/purchases to AdsConversionEvent.integrationWhatsappId", () => {
    const query = renderContactWhere(
      applyContactFilter(
        {
          operator: "and",
          conditions: [
            {
              field: "ctwaRetarget",
              segment: "purchases",
              integrationWhatsappId: "iw-1",
              since: "2026-07-01",
              until: "2026-07-31",
            },
          ],
        },
        "ws-1",
      ),
    )
    expect(query.sql).toContain(
      '"AdsConversionEvent"."integrationWhatsappId" =',
    )
    expect(query.params).toEqual(
      expect.arrayContaining(["purchase", "iw-1", "ws-1"]),
    )
  })

  test("omits workspace scoping when workspaceId is not provided", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "ctwaRetarget",
            segment: "conversations",
            since: "2026-07-01",
            until: "2026-07-31",
          },
        ],
      }),
    )
    expect(query.sql).not.toContain('"Contact"."workspaceId"')
    expect(query.sql).not.toContain("INNER JOIN")
  })

  test("renders no predicate for a malformed ctwaRetarget condition", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [{ field: "ctwaRetarget", segment: "not-a-real-segment" }],
    })
    expect(where).toEqual({})
  })

  test("pruneEmailPhoneFilterConditions leaves ctwaRetarget intact", () => {
    const contactFilter = {
      operator: "and" as const,
      conditions: [
        {
          field: "ctwaRetarget",
          segment: "purchases",
          adId: "ad-1",
          since: "2026-07-01",
          until: "2026-07-31",
        },
        { field: "email", operator: "eq", value: "ada@example.com" },
      ],
    }

    expect(pruneEmailPhoneFilterConditions(contactFilter, false)).toEqual({
      operator: "and",
      conditions: [contactFilter.conditions[0]],
    })
  })
})

describe("applyContactFilter — tags relation", () => {
  test.each([
    [operatorTypes.enum.in, "in"],
    [operatorTypes.enum.eq, "in"],
    [operatorTypes.enum.notIn, "in"],
    [operatorTypes.enum.ne, "in"],
  ])("renders tags %s as EXISTS ContactToTag.tagId %s", (operator, sqlOp) => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [{ field: "tags", operator, value: ["tag-1"] }],
      }),
    )
    expect(query.sql).toContain(
      operator === operatorTypes.enum.in || operator === operatorTypes.enum.eq
        ? 'EXISTS (SELECT 1 FROM "ContactToTag"'
        : 'NOT EXISTS (SELECT 1 FROM "ContactToTag"',
    )
    expect(query.sql).toContain(`"ContactToTag"."tagId" ${sqlOp}`)
    expect(query.sql).not.toContain('"ContactToTag"."tagId" not in')
  })

  test("renders tags isEmpty as NOT EXISTS ContactToTag", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [{ field: "tags", operator: operatorTypes.enum.isEmpty }],
      }),
    )
    expect(query.sql).toContain('NOT EXISTS (SELECT 1 FROM "ContactToTag"')
  })
})

describe("applyContactFilter — conversation relation fields", () => {
  test("archived isEmpty/isNotEmpty/eq map to archivedAt null-checks", () => {
    const empty = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "archived", operator: operatorTypes.enum.isEmpty },
        ],
      }),
    )
    expect(empty.sql).toContain('NOT EXISTS (SELECT 1 FROM "Conversation"')
    expect(empty.sql).toContain('"Conversation"."archivedAt" IS NOT NULL')

    const notEmpty = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "archived", operator: operatorTypes.enum.isNotEmpty },
        ],
      }),
    )
    expect(notEmpty.sql).toContain('EXISTS (SELECT 1 FROM "Conversation"')
    expect(notEmpty.sql).toContain('"Conversation"."archivedAt" IS NOT NULL')

    const truthy = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "archived", operator: operatorTypes.enum.eq, value: "true" },
        ],
      }),
    )
    expect(truthy.sql).toContain('EXISTS (SELECT 1 FROM "Conversation"')
    expect(truthy.sql).toContain('"Conversation"."archivedAt" IS NOT NULL')

    const falsy = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "archived",
            operator: operatorTypes.enum.eq,
            value: "false",
          },
        ],
      }),
    )
    expect(falsy.sql).toContain('NOT EXISTS (SELECT 1 FROM "Conversation"')
    expect(falsy.sql).toContain('"Conversation"."archivedAt" IS NOT NULL')
  })

  test("followUp eq true/false and isEmpty map to the followed column", () => {
    const truthy = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "followUp", operator: operatorTypes.enum.eq, value: "true" },
        ],
      }),
    )
    expect(truthy.sql).toContain('EXISTS (SELECT 1 FROM "Conversation"')
    expect(truthy.sql).toContain('"Conversation"."followed" =')
    expect(truthy.sql).toContain("= true")

    const falsy = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "followUp",
            operator: operatorTypes.enum.eq,
            value: "false",
          },
        ],
      }),
    )
    expect(falsy.sql).toContain('NOT EXISTS (SELECT 1 FROM "Conversation"')
    expect(falsy.sql).toContain('"Conversation"."followed" = true')

    const empty = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "followUp", operator: operatorTypes.enum.isEmpty },
        ],
      }),
    )
    expect(empty.sql).toContain('NOT EXISTS (SELECT 1 FROM "Conversation"')
    expect(empty.sql).toContain('"Conversation"."followed" = true')
  })

  test("conversationTransferredToHuman maps to active bot handoff window", () => {
    const transferred = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "conversationTransferredToHuman",
            operator: operatorTypes.enum.eq,
            value: "true",
          },
        ],
      }),
    )
    // transferred to human ⟺ bot disabled and the handoff has not expired.
    expect(transferred.sql).toContain('EXISTS (SELECT 1 FROM "Conversation"')
    expect(transferred.sql).toContain('"Conversation"."botEnabled" =')
    expect(transferred.sql).toContain("= false")
    expect(transferred.sql).toContain('"Conversation"."botResumeAt" IS NULL')
    expect(transferred.sql).toContain('"Conversation"."botResumeAt" > NOW()')

    const notTransferred = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "conversationTransferredToHuman",
            operator: operatorTypes.enum.eq,
            value: "false",
          },
        ],
      }),
    )
    expect(notTransferred.sql).toContain(
      'NOT EXISTS (SELECT 1 FROM "Conversation"',
    )
    expect(notTransferred.sql).toContain('"Conversation"."botEnabled" = false')
    expect(notTransferred.sql).toContain('"Conversation"."botResumeAt" > NOW()')
  })
})

describe("applyContactFilter — custom fields", () => {
  const customField = (
    valueType: string,
    operator: string,
    value?: unknown,
    customFieldType = valueType === "datetime" ? "datetime" : undefined,
  ) => {
    const condition =
      value === undefined
        ? {
            field: "customField",
            customFieldId: "cf-1",
            valueType,
            customFieldType,
            operator,
          }
        : {
            field: "customField",
            customFieldId: "cf-1",
            valueType,
            customFieldType,
            operator,
            value,
          }

    return applyContactFilter({
      operator: "and",
      conditions: [condition],
    })
  }

  test.each([
    {
      valueType: "number",
      operator: operatorTypes.enum.ne,
      value: "2",
      contains: ["::numeric", "~"],
      absent: ["<>"],
      params: [2],
    },
    {
      valueType: "text",
      operator: operatorTypes.enum.ne,
      value: "vip",
      contains: ['"ContactCustomField"."value" ='],
      absent: ["<>"],
      params: ["vip"],
    },
    {
      valueType: "datetime",
      operator: operatorTypes.enum.ne,
      // Second precision + explicit Z offset -> a 1-second instant window.
      value: "2026-05-19T10:00:00Z",
      contains: [">=", "<"],
      absent: [" IS NOT TRUE OR ", " OR "],
      params: ["cf-1", "2026-05-19T10:00:00.000Z", "2026-05-19T10:00:01.000Z"],
    },
    {
      valueType: "text",
      operator: operatorTypes.enum.notContains,
      value: "vip",
      contains: ["ILIKE"],
      absent: ["NOT ILIKE"],
      params: ["%vip%"],
    },
    {
      valueType: "number",
      operator: operatorTypes.enum.notContains,
      value: "2",
      contains: ["ILIKE"],
      absent: ["NOT ILIKE"],
      params: ["%2%"],
    },
    {
      valueType: "number",
      operator: operatorTypes.enum.notBetween,
      value: ["1", "5"],
      contains: ["::numeric", ">=", "<="],
      absent: [" OR "],
      params: [1, 5],
    },
    {
      valueType: "datetime",
      operator: operatorTypes.enum.notBetween,
      value: ["2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z"],
      contains: [">=", "<"],
      absent: [" OR "],
      // Upper bound extends to the end of the typed second (00:00:00 -> 00:00:01).
      params: ["2026-01-01T00:00:00.000Z", "2026-12-31T00:00:01.000Z"],
    },
    {
      valueType: "text",
      operator: operatorTypes.enum.isEmpty,
      value: undefined,
      contains: ["IS NOT NULL", "<> ''"],
      absent: [],
      params: [],
    },
    {
      valueType: "boolean",
      operator: operatorTypes.enum.isEmpty,
      value: undefined,
      contains: ["IS NOT NULL"],
      absent: [],
      params: [],
    },
  ])("renders custom-field $valueType $operator as NOT EXISTS over a positive predicate", ({
    valueType,
    operator,
    value,
    contains,
    absent,
    params,
  }) => {
    const query = renderFirstRawCondition(
      customField(valueType, operator, value),
    )
    expect(query.sql).toContain("NOT EXISTS (")
    for (const token of contains) {
      expect(query.sql).toContain(token)
    }
    for (const token of absent) {
      expect(query.sql).not.toContain(token)
    }
    for (const param of params) {
      expect(query.params).toContain(param)
    }
  })

  test.each([
    ["text", operatorTypes.enum.eq, "vip", ['"ContactCustomField"."value" =']],
    ["text", operatorTypes.enum.eq, "1", ['"ContactCustomField"."value" =']],
    ["text", operatorTypes.enum.isNotEmpty, undefined, ["IS NOT NULL"]],
    ["text", operatorTypes.enum.contains, "vip", ["ILIKE"]],
    ["text", operatorTypes.enum.startsWith, "vip", ["ILIKE"]],
    ["text", operatorTypes.enum.endsWith, "vip", ["ILIKE"]],
    ["number", operatorTypes.enum.gt, "12", ["::numeric", ">"]],
    ["number", operatorTypes.enum.gte, "12", ["::numeric", ">="]],
    ["number", operatorTypes.enum.lt, "12", ["::numeric", "<"]],
    ["number", operatorTypes.enum.lte, "12", ["::numeric", "<="]],
    [
      "number",
      operatorTypes.enum.isBetween,
      ["10", "20"],
      ["::numeric", ">=", "<="],
    ],
  ])("renders positive custom-field %s %s as EXISTS", (valueType, operator, value, contains) => {
    const query = renderFirstRawCondition(
      customField(valueType, operator, value),
    )
    expect(query.sql).toContain("EXISTS (")
    expect(query.sql).not.toContain("NOT EXISTS")
    for (const token of contains) {
      expect(query.sql).toContain(token)
    }
  })

  test("escapes LIKE wildcards for custom-field text search", () => {
    const query = renderFirstRawCondition(
      customField("text", operatorTypes.enum.contains, "100%_ready\\ok"),
    )

    expect(query.params).toContain("cf-1")
    expect(query.params).toContain("%100\\%\\_ready\\\\ok%")
  })

  test("drops numeric custom-field conditions with non-numeric values", () => {
    expect(customField("number", operatorTypes.enum.gt, "abc")).toEqual({})
  })

  test("drops numeric custom-field negation with a non-numeric value", () => {
    expect(customField("number", operatorTypes.enum.ne, "abc")).toEqual({})
  })

  test("drops datetime custom-field negation with an invalid date", () => {
    expect(
      customField("datetime", operatorTypes.enum.ne, "not-a-date"),
    ).toEqual({})
  })

  test("renders date custom-field equality as a day-only comparison", () => {
    const query = renderFirstRawCondition(
      customField("datetime", operatorTypes.enum.eq, "2026-07-22", "date"),
    )

    expect(query.sql).toContain("left(")
    expect(query.sql).not.toContain("::timestamptz")
    expect(query.params).toContain("2026-07-22")
  })

  test("resolves legacy temporal custom-field filters without saved customFieldType", () => {
    const query = renderFirstRawCondition(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "customField",
            customFieldId: "cf-1",
            valueType: "datetime",
            operator: operatorTypes.enum.eq,
            value: "2026-07-22 09:30",
          },
        ],
      }),
    )

    expect(query.sql).toContain('FROM "CustomField"')
    expect(query.sql).toContain('"CustomField"."type" =')
    expect(query.sql).toContain("::timestamp")
    expect(query.sql).toContain("::timestamptz")
    expect(query.params).toContain("date")
    expect(query.params).toContain("2026-07-22T09:30:00")
  })

  test("renders date custom-field equality with time as a naive wall-clock minute window", () => {
    const query = renderFirstRawCondition(
      customField(
        "datetime",
        operatorTypes.enum.eq,
        "2026-07-22 09:30",
        "date",
      ),
    )

    expect(query.sql).not.toContain("::timestamptz")
    expect(query.sql).toContain("::timestamp")
    expect(query.sql).not.toContain("left(")
    expect(query.params).toContain("2026-07-22T09:30:00")
    expect(query.params).toContain("2026-07-22T09:31:00")
  })

  test("compares a date custom field with an explicit offset by an instant window", () => {
    // The user typed a timezone, so we honor it: +07:00 09:30:00 -> 02:30:00Z,
    // and the typed seconds narrow the match to that one-second window.
    const query = renderFirstRawCondition(
      customField(
        "datetime",
        operatorTypes.enum.eq,
        "2026-07-22T09:30:00+07:00",
        "date",
      ),
    )

    expect(query.sql).toContain("::timestamptz")
    expect(query.params).toContain("2026-07-22T02:30:00.000Z")
    expect(query.params).toContain("2026-07-22T02:30:01.000Z")
  })

  test.each([
    [operatorTypes.enum.gt, "2026-07-23T00:00:00.000Z"],
    [operatorTypes.enum.gte, "2026-07-22T00:00:00.000Z"],
    [operatorTypes.enum.lt, "2026-07-22T00:00:00.000Z"],
    [operatorTypes.enum.lte, "2026-07-23T00:00:00.000Z"],
  ])("compares a date-only custom field %s by a naive day window", (operator, boundary) => {
    const query = renderFirstRawCondition(
      customField("datetime", operator, "2026-07-22", "date"),
    )

    expect(query.sql).not.toContain("::timestamptz")
    expect(query.sql).toContain("::timestamp")
    expect(query.params).toContain(boundary)
  })

  test("renders date custom-field inequality as NOT EXISTS over a day comparison", () => {
    const query = renderFirstRawCondition(
      customField("datetime", operatorTypes.enum.ne, "2026-07-22", "date"),
    )

    expect(query.sql).toContain("NOT EXISTS (")
    expect(query.sql).toContain("left(")
    expect(query.params).toContain("2026-07-22")
  })

  test("compares a date custom-field range by naive wall clock", () => {
    const query = renderFirstRawCondition(
      customField(
        "datetime",
        operatorTypes.enum.isBetween,
        ["2026-01-01", "2026-12-31"],
        "date",
      ),
    )

    expect(query.sql).not.toContain("::timestamptz")
    expect(query.params).toContain("2026-01-01T00:00:00")
    // Upper bound extends to the end of the typed day (through all of 12-31).
    expect(query.params).toContain("2027-01-01T00:00:00")
  })

  test("compares a date custom-field range by instant when both bounds carry an offset", () => {
    const query = renderFirstRawCondition(
      customField(
        "datetime",
        operatorTypes.enum.isBetween,
        ["2026-01-01T00:00:00+07:00", "2026-12-31T00:00:00+07:00"],
        "date",
      ),
    )

    expect(query.sql).toContain("::timestamptz")
    expect(query.params).toContain("2025-12-31T17:00:00.000Z")
    expect(query.params).toContain("2026-12-30T17:00:01.000Z")
  })

  test("extends a datetime range upper bound to the end of the typed minute", () => {
    // From=To "12:12" must span the whole 12:12 minute, not just the instant
    // 12:12:00 — so a stored 12:12:12 falls inside the range. The upper bound is
    // the half-open END of the typed unit (12:13:00), never its start.
    const query = renderFirstRawCondition(
      applyContactFilter({
        operator: "and",
        timezone: "Asia/Ho_Chi_Minh",
        conditions: [
          {
            field: "customField",
            customFieldId: "cf-1",
            valueType: "datetime",
            customFieldType: "datetime",
            operator: operatorTypes.enum.isBetween,
            value: ["2026-07-02 12:12", "2026-07-02 12:12"],
          },
        ],
      }),
    )

    expect(query.sql).toContain(">=")
    expect(query.sql).toContain("<")
    expect(query.sql).not.toContain("<=")
    expect(query.params).toContain("2026-07-02T05:12:00.000Z")
    expect(query.params).toContain("2026-07-02T05:13:00.000Z")
  })

  test.each([
    operatorTypes.enum.gt,
    operatorTypes.enum.gte,
    operatorTypes.enum.lt,
    operatorTypes.enum.lte,
  ])("renders datetime custom-field comparison %s with guarded cast", (operator) => {
    const query = renderFirstRawCondition(
      customField("datetime", operator, "2026-05-19T10:00:00Z"),
    )
    expect(query.sql).toContain("EXISTS (")
    expect(query.sql).not.toContain("NOT EXISTS")
    expect(query.sql).toContain("CASE WHEN")
    expect(query.sql).toContain("::timestamptz")
  })

  test.each([
    "boolean",
    "select",
    "text",
  ])("renders %s custom-field eq as a plain value comparison", (valueType) => {
    const query = renderFirstRawCondition(
      customField(valueType, operatorTypes.enum.eq, "yes"),
    )
    expect(query.sql).toContain("EXISTS (")
    expect(query.sql).not.toContain("NOT EXISTS")
    expect(query.sql).toContain('"ContactCustomField"."value" =')
    expect(query.params).toContain("yes")
  })
})

describe("applyContactFilter — couponTopic (dynamic per-topic field)", () => {
  test("isNotEmpty matches contacts issued a coupon of this topic", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "couponTopic",
          topicId: "topic-1",
          operator: operatorTypes.enum.isNotEmpty,
        },
      ],
    })
    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("EXISTS")
    expect(query.sql).not.toContain("usedAt")
    expect(query.params).toContain("topic-1")
  })

  test("used matches contacts who redeemed a coupon of this topic", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "couponTopic",
          topicId: "topic-1",
          operator: operatorTypes.enum.used,
        },
      ],
    })
    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("EXISTS")
    expect(query.sql).toContain("usedAt")
    expect(query.params).toContain("topic-1")
  })

  test("used correlates workspace through the active contact table alias", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "couponTopic",
          topicId: "topic-1",
          operator: operatorTypes.enum.used,
        },
      ],
    })
    const raw = (where as { AND?: Array<{ RAW?: unknown }> }).AND?.[0]?.RAW
    expect(typeof raw).toBe("function")

    const contactAlias = alias(contactModel, "contact_alias")
    const query = new PgDialect().sqlToQuery(
      (raw as (table: typeof contactModel) => SQL)(contactAlias),
    )

    expect(query.sql).toContain('"contact_alias"."workspaceId"')
    expect(query.sql).not.toContain('"Contact"."workspaceId"')
  })

  test("eq scopes to a specific coupon code within the topic", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "couponTopic",
          topicId: "topic-1",
          operator: operatorTypes.enum.eq,
          value: "SAVE10",
        },
      ],
    })
    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("EXISTS")
    expect(query.sql).not.toContain("usedAt")
    expect(query.params).toEqual(["topic-1", "SAVE10"])
  })

  test("eq escapes LIKE wildcards in the coupon code so it matches exactly", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "couponTopic",
          topicId: "topic-1",
          operator: operatorTypes.enum.eq,
          value: "A%B_C",
        },
      ],
    })
    const query = renderFirstRawCondition(where)

    expect(query.params).toEqual(["topic-1", escapeLikePattern("A%B_C")])
    expect(query.params).not.toContain("A%B_C")
  })

  test("drops the condition when topicId is missing", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "couponTopic", operator: operatorTypes.enum.isNotEmpty },
        ],
      }),
    ).toEqual({})
  })

  test("drops unsupported operators", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "couponTopic",
            topicId: "topic-1",
            operator: operatorTypes.enum.contains,
            value: "x",
          },
        ],
      }),
    ).toEqual({})
  })
})

describe("applyContactFilter — operator combining", () => {
  test("wraps multiple conditions in OR when operator is 'or'", () => {
    const where = applyContactFilter({
      operator: "or",
      conditions: [
        { field: "fullName", operator: operatorTypes.enum.eq, value: "Ada" },
        { field: "email", operator: operatorTypes.enum.eq, value: "a@b.co" },
      ],
    })
    const query = renderContactWhere(where)

    expect(query.sql.toLowerCase()).toContain('"contact"."fullname" ilike')
    expect(query.sql.toLowerCase()).toContain('"contact"."email" ilike')
    expect(query.params).toEqual(["Ada", "a@b.co"])
  })

  test("returns an empty object for empty conditions", () => {
    expect(applyContactFilter({ operator: "and", conditions: [] })).toEqual({})
  })

  test("drops unknown fields and keeps only recognized conditions", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        { field: "notARealField", operator: operatorTypes.enum.eq, value: "x" },
        { field: "email", operator: operatorTypes.enum.eq, value: "a@b.co" },
      ],
    })
    const query = renderContactWhere(where)

    expect(query.sql.toLowerCase()).toContain('"contact"."email" ilike')
    expect(query.params).toEqual(["a@b.co"])
  })
})

describe("applyContactFilter — buildContactWhere base", () => {
  test("returns a workspace-only where when no keyword and no filter", () => {
    expect(buildContactWhere({ workspaceId: "ws-1" })).toEqual({
      workspaceId: "ws-1",
    })
  })

  test("returns a workspace-only where when the filter has no conditions", () => {
    expect(
      buildContactWhere({
        workspaceId: "ws-1",
        contactFilter: { operator: "and", conditions: [] },
      }),
    ).toEqual({ workspaceId: "ws-1" })
  })
})

describe("buildSmartKeywordWhere", () => {
  test("searches email-like input by email only when email is visible", () => {
    expect(buildSmartKeywordWhere("john@x.com")).toEqual({
      email: { ilike: "%john@x.com%" },
    })
  })

  test("falls back to names and sourceId for email-like input when email is hidden", () => {
    const query = renderContactWhere({
      workspaceId: "ws-1",
      ...buildSmartKeywordWhere("john@x.com", {
        includeEmailAndPhone: false,
      }),
    })

    expect(query.sql.toLowerCase()).toContain('"contact"."firstname" ilike')
    expect(query.sql.toLowerCase()).toContain('"contact"."lastname" ilike')
    expect(query.sql).toContain('"ContactInbox"."sourceId" =')
    expect(query.sql.toLowerCase()).not.toContain('"contact"."email" ilike')
  })

  test("searches phone-like input by normalized phone only", () => {
    expect(buildSmartKeywordWhere("+84 90-123-4567")).toEqual({
      phoneNumber: { ilike: "%+84901234567%" },
    })
  })

  test("falls back to names and sourceId for phone-like input when phone is hidden", () => {
    const query = renderContactWhere({
      workspaceId: "ws-1",
      ...buildSmartKeywordWhere("+84 90-123-4567", {
        includeEmailAndPhone: false,
      }),
    })

    expect(query.sql.toLowerCase()).toContain('"contact"."firstname" ilike')
    expect(query.sql.toLowerCase()).toContain('"contact"."lastname" ilike')
    expect(query.sql).toContain('"ContactInbox"."sourceId" =')
    expect(query.sql.toLowerCase()).not.toContain(
      '"contact"."phonenumber" ilike',
    )
  })

  test("searches pure digits across visible columns and exact sourceId", () => {
    const query = renderContactWhere({
      workspaceId: "ws-1",
      ...buildSmartKeywordWhere("12345"),
    })

    expect(query.sql.toLowerCase()).toContain('"contact"."firstname" ilike')
    expect(query.sql.toLowerCase()).toContain('"contact"."lastname" ilike')
    expect(query.sql.toLowerCase()).toContain('"contact"."email" ilike')
    expect(query.sql.toLowerCase()).toContain('"contact"."phonenumber" ilike')
    expect(query.sql).toContain('"ContactInbox"."sourceId" =')
    expect(query.params).toEqual([
      "ws-1",
      "%12345%",
      "%12345%",
      "%12345%",
      "%12345%",
      "12345",
    ])
  })

  test("searches plain text by names and exact sourceId only", () => {
    const query = renderContactWhere({
      workspaceId: "ws-1",
      ...buildSmartKeywordWhere("john"),
    })

    expect(query.sql.toLowerCase()).toContain('"contact"."firstname" ilike')
    expect(query.sql.toLowerCase()).toContain('"contact"."lastname" ilike')
    expect(query.sql).toContain('"ContactInbox"."sourceId" =')
    expect(query.sql.toLowerCase()).not.toContain('"contact"."email" ilike')
    expect(query.sql.toLowerCase()).not.toContain(
      '"contact"."phonenumber" ilike',
    )
    expect(query.params).toEqual(["ws-1", "%john%", "%john%", "john"])
  })

  test("escapes LIKE metacharacters in keyword search", () => {
    const query = renderContactWhere({
      workspaceId: "ws-1",
      ...buildSmartKeywordWhere("100%_ready\\"),
    })

    expect(query.params).toContain("%100\\%\\_ready\\\\%")
    expect(query.params).toContain("100%_ready\\")
  })
})

describe("applyContactFilter — unsupported operator fallbacks (dropped → {})", () => {
  test.each([
    ["interactedInLast24h", operatorTypes.enum.contains, "x"],
    ["tags", operatorTypes.enum.contains, ["t"]],
    ["source", operatorTypes.enum.contains, ["s"]],
    ["inbox", operatorTypes.enum.gt, ["i"]],
    ["currentChannel", operatorTypes.enum.gt, ["c"]],
    ["conversationTransferredToHuman", operatorTypes.enum.contains, "x"],
    ["subscribedToBroadcast", operatorTypes.enum.contains, "x"],
    ["blocked", operatorTypes.enum.gt, "x"],
    ["emailWasVerified", operatorTypes.enum.ne, "true"],
    ["optedInForEmail", operatorTypes.enum.ne, "true"],
    ["followUp", operatorTypes.enum.ne, "true"],
    ["archived", operatorTypes.enum.in, ["x"]],
  ])("drops %s with unsupported operator %s", (field, operator, value) => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [{ field, operator, value }],
      }),
    ).toEqual({})
  })

  test("drops a date field with an unsupported operator on a valid value", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastSeen",
            operator: operatorTypes.enum.contains,
            value: "2026-05-19T10:00:00Z",
          },
        ],
      }),
    ).toEqual({})
  })

  test("drops an unrecognized column operator", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [{ field: "fullName", operator: "weirdOp", value: "x" }],
      }),
    ).toEqual({})
  })

  test("keeps known column operators unchanged", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          { field: "country", operator: operatorTypes.enum.eq, value: "VN" },
        ],
      }),
    ).toEqual({ AND: [{ country: "VN" }] })
  })
})

describe("applyContactFilter — custom field remaining branches", () => {
  const cf = (valueType: string, operator: string, value?: unknown) =>
    applyContactFilter({
      operator: "and",
      conditions: [
        value === undefined
          ? { field: "customField", customFieldId: "cf-1", valueType, operator }
          : {
              field: "customField",
              customFieldId: "cf-1",
              valueType,
              operator,
              value,
            },
      ],
    })
  const cfSql = (valueType: string, operator: string, value?: unknown) =>
    renderFirstRawCondition(cf(valueType, operator, value)).sql

  // ── number ──────────────────────────────────────────────────────────────────
  test("drops number isBetween when the value is not a valid interval", () => {
    expect(cf("number", operatorTypes.enum.isBetween, "10")).toEqual({})
  })
  test("drops number isBetween when interval bounds are non-numeric", () => {
    expect(cf("number", operatorTypes.enum.isBetween, ["a", "b"])).toEqual({})
  })
  test("renders number notBetween with a negated numeric guard", () => {
    const sql = cfSql("number", operatorTypes.enum.notBetween, ["10", "20"])
    expect(sql).toContain("::numeric")
    expect(sql.toUpperCase()).toContain("NOT")
  })
  test("drops number comparison with an empty value", () => {
    expect(cf("number", operatorTypes.enum.eq, "")).toEqual({})
  })
  test.each([
    operatorTypes.enum.notContains,
    operatorTypes.enum.startsWith,
    operatorTypes.enum.endsWith,
  ])("renders number text-search operator %s as ILIKE", (operator) => {
    expect(cfSql("number", operator, "12").toLowerCase()).toContain("ilike")
  })
  test("drops number with an unsupported operator", () => {
    expect(cf("number", operatorTypes.enum.in, "12")).toEqual({})
  })

  // ── datetime ────────────────────────────────────────────────────────────────
  test("drops datetime isBetween when a bound is invalid", () => {
    expect(
      cf("datetime", operatorTypes.enum.isBetween, [
        "not-a-date",
        "2026-05-31T23:59:59Z",
      ]),
    ).toEqual({})
  })
  test("renders datetime notBetween with a guarded cast", () => {
    const sql = cfSql("datetime", operatorTypes.enum.notBetween, [
      "2026-05-01T00:00:00Z",
      "2026-05-31T23:59:59Z",
    ])
    expect(sql).toContain("CASE WHEN")
    expect(sql).toContain("::timestamptz")
  })
  test("renders datetime isBetween with timezone-aware range bounds", () => {
    const where = applyContactFilter({
      operator: "and",
      timezone: "Asia/Ho_Chi_Minh",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.isBetween,
          value: ["2026-05-01 00:00", "2026-05-31 23:59"],
        },
      ],
    })

    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("CASE WHEN")
    expect(query.sql).toContain(">=")
    expect(query.sql).toContain("<")
    expect(query.params).toContain("2026-04-30T17:00:00.000Z")
    // Upper bound extends to the end of the typed minute (23:59 -> next 00:00).
    expect(query.params).toContain("2026-05-31T17:00:00.000Z")
  })
  test("renders datetime ne as a guarded outside-the-day range", () => {
    const sql = cfSql("datetime", operatorTypes.enum.ne, "2026-05-19T10:00:00Z")
    expect(sql).toContain("CASE WHEN")
  })
  test("drops datetime with an unsupported operator", () => {
    expect(
      cf("datetime", operatorTypes.enum.in, "2026-05-19T10:00:00Z"),
    ).toEqual({})
  })

  // ── text / boolean / select ───────────────────────────────────────────────
  test("drops text custom field with an empty value", () => {
    expect(cf("text", operatorTypes.enum.eq, "")).toEqual({})
  })
  test("drops text custom field with an unsupported operator", () => {
    expect(cf("text", operatorTypes.enum.gt, "x")).toEqual({})
  })
})

describe("applyContactFilter — W1 relation activations", () => {
  const renderSingleCondition = (field: string, value = "option-1") =>
    renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field,
            operator: operatorTypes.enum.in,
            value: [value],
          },
        ],
      }),
    )

  test.each([
    ["broadcastSent", '"ContactOnBroadcast"."sent" = true'],
    ["broadcastDelivered", '"ContactOnBroadcast"."deliveredAt" IS NOT NULL'],
    ["broadcastSeen", '"ContactOnBroadcast"."seenAt" IS NOT NULL'],
    ["broadcastClicked", '"ContactOnBroadcast"."clickedAt" IS NOT NULL'],
    ["broadcastFailed", '"ContactOnBroadcast"."failedAt" IS NOT NULL'],
  ])("renders %s against ContactOnBroadcast", (field, predicate) => {
    const query = renderSingleCondition(field)

    expect(query.sql).toContain('EXISTS (SELECT 1 FROM "ContactOnBroadcast"')
    expect(query.sql).toContain('"ContactOnBroadcast"."broadcastId" in')
    expect(query.sql).toContain(predicate)
  })

  test("renders subscribedToDripCampaign against ContactOnSequence", () => {
    const query = renderSingleCondition("subscribedToDripCampaign")

    expect(query.sql).toContain('EXISTS (SELECT 1 FROM "ContactOnSequence"')
    expect(query.sql).toContain('"ContactOnSequence"."sequenceId" in')
  })

  test("renders entryPointsLinks against RefLinkStat", () => {
    const query = renderSingleCondition("entryPointsLinks")

    expect(query.sql).toContain('EXISTS (SELECT 1 FROM "RefLinkStat"')
    expect(query.sql).toContain('"RefLinkStat"."linkId" in')
  })

  test("preserves extra predicates for empty broadcast event filters", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "broadcastDelivered",
            operator: operatorTypes.enum.isEmpty,
          },
        ],
      }),
    )

    expect(query.sql).toContain(
      'NOT EXISTS (SELECT 1 FROM "ContactOnBroadcast"',
    )
    expect(query.sql).toContain(
      '"ContactOnBroadcast"."deliveredAt" IS NOT NULL',
    )
  })
})
