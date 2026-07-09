import { relationsFilterToSQL, type SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { operatorTypes } from "../src/partials"
import {
  applyContactFilter,
  buildContactInboxContactFilterSQL,
  buildContactWhere,
} from "../src/queries/contact-filter"
import { contactInboxModel, contactModel } from "../src/schema"

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

describe("applyContactFilter", () => {
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

  test("renders static date equality as a day range", () => {
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

    expect(query.sql).toContain('"Contact"."createdAt" >=')
    expect(query.sql).toContain("date_trunc('day'")
    expect(query.sql).toContain("INTERVAL '1 day'")
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

    expect(query.sql).toContain('"Contact"."lastReadAt" >=')
    expect(query.sql).toContain('"Contact"."lastReadAt" <=')
    expect(query.sql).toContain("::timestamptz")
    expect(query.params).toEqual([
      "2026-05-01T00:00:00Z",
      "2026-05-31T23:59:59Z",
    ])
    expect(query.sql).not.toContain('"Contact"."lastReadAt" IS NULL')
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

    expect(query.sql).toContain('"Contact"."lastReadAt" <')
    expect(query.sql).toContain('"Contact"."lastReadAt" >')
    expect(query.sql).toContain('"Contact"."lastReadAt" IS NULL')
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

  test("guards datetime custom-field casts and compares equality by day", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "customField",
          customFieldId: "cf-1",
          valueType: "datetime",
          operator: operatorTypes.enum.eq,
          value: "2026-05-19T10:00:00Z",
        },
      ],
    })

    const query = renderFirstRawCondition(where)

    expect(query.sql).toContain("CASE WHEN")
    expect(query.sql).toContain("NULLIF")
    expect(query.sql).toContain("::timestamptz")
    expect(query.sql).toContain("date_trunc('day'")
    expect(query.sql).toContain("INTERVAL '1 day'")
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
    expect(query.sql).toContain("<=")
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

    expect(where).toEqual({
      workspaceId: "ws-1",
      AND: [
        {
          OR: [
            { firstName: { ilike: "%acme%" } },
            { lastName: { ilike: "%acme%" } },
            { email: { ilike: "%acme%" } },
            { phoneNumber: { ilike: "%acme%" } },
          ],
        },
        {
          OR: [{ fullName: { ilike: "%bob%" } }],
        },
      ],
    })
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
    ["fullName", "fullName"],
    ["email", "email"],
    ["gender", "gender"],
    ["country", "country"],
    ["locale", "locale"],
    ["timezone", "timezone"],
    ["phone", "phoneNumber"],
  ])("maps %s eq to the %s column", (field, column) => {
    expect(firstAnd(field, operatorTypes.enum.eq, "x")).toEqual({
      [column]: "x",
    })
  })

  test.each([
    [operatorTypes.enum.eq, "Ada", { fullName: "Ada" }],
    [
      operatorTypes.enum.ne,
      "Ada",
      {
        OR: [{ fullName: { ne: "Ada" } }, { fullName: { isNull: true } }],
      },
    ],
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
    ["fullName", "fullName"],
    ["email", "email"],
    ["gender", "gender"],
    ["country", "country"],
    ["locale", "locale"],
    ["timezone", "timezone"],
    ["phone", "phoneNumber"],
  ])("includes NULL rows for %s negation operators", (field, column) => {
    expect(firstAnd(field, operatorTypes.enum.ne, "x")).toEqual({
      OR: [{ [column]: { ne: "x" } }, { [column]: { isNull: true } }],
    })
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
    ["lastSeen", "lastReadAt"],
  ])("maps %s isEmpty/isNotEmpty to %s null-checks", (field, column) => {
    expect(firstAnd(field, operatorTypes.enum.isEmpty)).toEqual({
      [column]: { isNull: true },
    })
    expect(firstAnd(field, operatorTypes.enum.isNotEmpty)).toEqual({
      [column]: { isNotNull: true },
    })
  })

  test("renders ne as an outside-the-day range", () => {
    const query = renderContactWhere(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "lastSeen",
            operator: operatorTypes.enum.ne,
            value: "2026-05-19T10:00:00Z",
          },
        ],
      }),
    )
    expect(query.sql).toContain('"Contact"."lastReadAt" <')
    expect(query.sql).toContain('"Contact"."lastReadAt" >=')
    expect(query.sql).toContain('"Contact"."lastReadAt" IS NULL')
    expect(query.sql).toContain("date_trunc('day'")
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
    expect(eq.sql).toContain("date_trunc('day'")

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
  const customField = (valueType: string, operator: string, value?: unknown) =>
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
      value: "2026-05-19T10:00:00Z",
      contains: [">=", "<"],
      absent: [" IS NOT TRUE OR ", " OR "],
      params: ["2026-05-19T10:00:00Z"],
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
      contains: [">=", "<="],
      absent: [" OR "],
      params: ["2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z"],
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

describe("applyContactFilter — operator combining", () => {
  test("wraps multiple conditions in OR when operator is 'or'", () => {
    const where = applyContactFilter({
      operator: "or",
      conditions: [
        { field: "fullName", operator: operatorTypes.enum.eq, value: "Ada" },
        { field: "email", operator: operatorTypes.enum.eq, value: "a@b.co" },
      ],
    })
    expect(where).toEqual({
      OR: [{ fullName: "Ada" }, { email: "a@b.co" }],
    })
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
    expect(where).toEqual({ AND: [{ email: "a@b.co" }] })
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

  test("passes the raw value through for an unrecognized column operator", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [{ field: "fullName", operator: "weirdOp", value: "x" }],
      }),
    ).toEqual({ AND: [{ fullName: "x" }] })
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
