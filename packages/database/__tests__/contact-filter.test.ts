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
  test("maps inbox filters to contactInboxes.inboxId", () => {
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

    expect(where).toEqual({
      AND: [
        {
          contactInboxes: {
            inboxId: {
              in: ["123", "456"],
            },
          },
        },
      ],
    })
  })

  test("preserves multiple AND conditions on contactInboxes", () => {
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

    expect(where).toEqual({
      AND: [
        {
          contactInboxes: {
            channel: {
              in: ["messenger"],
            },
          },
        },
        {
          contactInboxes: {
            inboxId: {
              in: ["123"],
            },
          },
        },
      ],
    })
  })

  test("maps tag filters to tag ids", () => {
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

    expect(where).toEqual({
      AND: [
        {
          tags: {
            id: {
              in: ["tag-1"],
            },
          },
        },
      ],
    })
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

  test("maps dropdown eq/ne array values to in/notIn relations", () => {
    expect(
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
    ).toEqual({
      AND: [
        {
          contactInboxes: {
            channel: {
              in: ["messenger", "whatsapp"],
            },
          },
        },
      ],
    })

    expect(
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
    ).toEqual({
      AND: [
        {
          tags: {
            id: {
              notIn: ["tag-1"],
            },
          },
        },
      ],
    })
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
  })

  test("renders static date notBetween with supported SQL", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          field: "lastInteraction",
          operator: operatorTypes.enum.notBetween,
          value: ["2026-05-01T00:00:00Z", "2026-05-31T23:59:59Z"],
        },
      ],
    })

    const query = renderContactWhere(where)

    expect(query.sql).toContain('"Contact"."lastActivityAt" <')
    expect(query.sql).toContain('"Contact"."lastActivityAt" >')
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
