import { relationsFilterToSQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { afterEach, describe, expect, test } from "vitest"
import { env } from "../src/keys"
import {
  CONTACT_ACTIVITY_FILTERS,
  type ContactActivityFilterField,
} from "../src/partials/contact-activity"
import { applyContactFilter } from "../src/queries/contact-filter"
import { contactModel } from "../src/schema"

const WORKSPACE_ID = "42"

const render = (where: Record<string, unknown>) => {
  const sqlWhere = relationsFilterToSQL(contactModel, where as never)
  if (!sqlWhere) {
    throw new Error("Expected the filter to render SQL")
  }
  return new PgDialect().sqlToQuery(sqlWhere)
}

// `null` stands for "no workspace" (an `undefined` argument would take the default).
const renderCondition = (
  condition: { field: string; operator: string; value?: unknown },
  workspaceId: string | null = WORKSPACE_ID,
  timezone?: string,
) =>
  render(
    applyContactFilter(
      { operator: "and", conditions: [condition], timezone },
      workspaceId ?? undefined,
    ),
  )

const ACTIVITY_FIELDS = Object.keys(
  CONTACT_ACTIVITY_FILTERS,
) as ContactActivityFilterField[]

const sampleValue = (field: ContactActivityFilterField): string =>
  CONTACT_ACTIVITY_FILTERS[field].valueFormat === "flowId:nodeId" ? "7:9" : "9"

describe("activity-backed filters (set fields)", () => {
  describe.each(ACTIVITY_FIELDS)("%s", (field) => {
    const config = CONTACT_ACTIVITY_FILTERS[field]

    test.each([
      "in",
      "eq",
    ])("%s is an EXISTS over the contact's activity", (operator) => {
      const query = renderCondition({
        field,
        operator,
        value: [sampleValue(field)],
      })
      expect(query.sql).toContain(
        'EXISTS (SELECT 1\n    FROM "ContactActivity" a',
      )
      expect(query.sql).not.toContain("NOT EXISTS")
      expect(query.params).toContain(config.activityType)
      expect(query.params).toContain(config.referenceType)
    })

    test.each([
      "notIn",
      "ne",
    ])("%s is the exact NOT EXISTS complement", (operator) => {
      const query = renderCondition({
        field,
        operator,
        value: [sampleValue(field)],
      })
      expect(query.sql).toContain("NOT EXISTS")
    })

    test("isEmpty is NOT EXISTS of any activity of that type, isNotEmpty is EXISTS", () => {
      const empty = renderCondition({ field, operator: "isEmpty" })
      const notEmpty = renderCondition({ field, operator: "isNotEmpty" })
      expect(empty.sql).toContain("NOT EXISTS")
      expect(notEmpty.sql).not.toContain("NOT EXISTS")
      expect(empty.sql).not.toContain('"referenceId"')
      expect(notEmpty.sql).not.toContain('"referenceId"')
    })

    test("scopes every subquery by a parameterized workspaceId (partition pruning)", () => {
      const query = renderCondition({
        field,
        operator: "in",
        value: [sampleValue(field)],
      })
      expect(query.sql).toContain('a."workspaceId" = $1::bigint')
      expect(query.params[0]).toBe(WORKSPACE_ID)
    })

    test("fails closed without a workspace", () => {
      expect(
        renderCondition(
          { field, operator: "in", value: [sampleValue(field)] },
          null,
        ).sql,
      ).toContain("FALSE")
    })

    test("fails closed for an unsupported operator", () => {
      const query = renderCondition({
        field,
        operator: "contains",
        value: [sampleValue(field)],
      })
      expect(query.sql).toContain("FALSE")
      expect(query.sql).not.toContain("ContactActivity")
    })
  })

  test("a flow node is matched by the (flowId, nodeId) pair, never the node alone", () => {
    const query = renderCondition({
      field: "executedStep",
      operator: "in",
      value: ["7:9", "7:10"],
    })
    expect(query.sql).toContain('(a."parentReferenceId", a."referenceId") IN')
    expect(query.params).toEqual([
      WORKSPACE_ID,
      "flowNodeExecuted",
      "flowNode",
      "7",
      "9",
      "7",
      "10",
    ])
  })

  test("an unscoped reference pins the parent sentinel so the primary key is fully used", () => {
    const query = renderCondition({
      field: "executedFlow",
      operator: "in",
      value: ["5"],
    })
    expect(query.sql).toContain('a."parentReferenceId" = $4::bigint')
    expect(query.params).toContain("0")
  })

  test("the fixed noTopic value maps to the no-reference sentinel for email only", () => {
    const email = renderCondition({
      field: "emailSent",
      operator: "in",
      value: ["noTopic", "12"],
    })
    expect(email.params).toEqual([
      WORKSPACE_ID,
      "messageSent",
      "emailTopic",
      "0",
      "-1",
      "12",
    ])

    const flow = renderCondition({
      field: "executedFlow",
      operator: "in",
      value: ["noTopic"],
    })
    expect(flow.sql).toContain("FALSE")
  })

  test("duplicate values collapse to one bound id each", () => {
    const query = renderCondition({
      field: "keywordsReceived",
      operator: "in",
      value: ["5", "5", "6", "5"],
    })
    expect(query.params.filter((param) => param === "5")).toHaveLength(1)
  })

  test("accepts a bare string as a single value", () => {
    const query = renderCondition({
      field: "keywordsReceived",
      operator: "eq",
      value: "5",
    })
    expect(query.params).toContain("5")
  })

  test.each([
    ["no value", undefined],
    ["an empty list", []],
    ["zero", ["0"]],
    ["a leading zero", ["05"]],
    ["a negative id", ["-1"]],
    ["a non-numeric id", ["abc"]],
    ["a non-string id", [5]],
    ["an id past bigint", ["9223372036854775808"]],
    ["SQL in the value", ['1); DROP TABLE "Contact"; --']],
  ])("fails closed for %s", (_label, value) => {
    const query = renderCondition({
      field: "keywordsReceived",
      operator: "in",
      value,
    })
    expect(query.sql).toContain("FALSE")
    expect(query.sql).not.toContain("ContactActivity")
  })

  test.each([
    ["a bare node id", "9"],
    ["too many parts", "7:9:1"],
    ["an empty flow", ":9"],
    ["an empty node", "7:"],
    ["a non-numeric node", "7:start-node"],
    ["a zero flow", "0:9"],
  ])("fails closed for an executedStep value with %s", (_label, value) => {
    const query = renderCondition({
      field: "executedStep",
      operator: "in",
      value: [value],
    })
    expect(query.sql).toContain("FALSE")
  })

  test("accepts the largest bigint and rejects more than 500 values", () => {
    const maximum = renderCondition({
      field: "executedFlow",
      operator: "in",
      value: ["9223372036854775807"],
    })
    expect(maximum.params).toContain("9223372036854775807")

    const many = Array.from({ length: 500 }, (_, index) => String(index + 1))
    expect(
      renderCondition({ field: "executedFlow", operator: "in", value: many })
        .params,
    ).toHaveLength(1 + 2 + 1 + 500)
    expect(
      renderCondition({
        field: "executedFlow",
        operator: "in",
        value: [...many, "501"],
      }).sql,
    ).toContain("FALSE")
  })

  test("a malformed condition never widens a mixed AND audience", () => {
    const query = render(
      applyContactFilter(
        {
          operator: "and",
          conditions: [
            { field: "executedFlow", operator: "in", value: ["abc"] },
            { field: "executedFlow", operator: "in", value: ["5"] },
          ],
        },
        WORKSPACE_ID,
      ),
    )
    expect(query.sql).toContain("FALSE")
    expect(query.sql).toContain("AND")
  })
})

describe("sentMessage", () => {
  test.each([
    ["eq", '"normalizedText" = $2'],
    ["startsWith", '"normalizedText" LIKE $2'],
    ["contains", '"normalizedText" LIKE $2'],
    ["endsWith", '"normalizedText" LIKE $2'],
  ])("%s is a positive EXISTS over the contact's keyword messages", (operator, fragment) => {
    const query = renderCondition({
      field: "sentMessage",
      operator,
      value: "hi",
    })
    expect(query.sql).toContain('FROM "ContactKeywordMessage" m')
    expect(query.sql).toContain(fragment)
    expect(query.sql).not.toContain("NOT EXISTS")
  })

  test.each([
    "ne",
    "notContains",
  ])("%s is NOT EXISTS of the positive form", (operator) => {
    const query = renderCondition({
      field: "sentMessage",
      operator,
      value: "hi",
    })
    expect(query.sql).toContain("NOT EXISTS")
  })

  test("isEmpty / isNotEmpty test for any stored message", () => {
    expect(
      renderCondition({ field: "sentMessage", operator: "isEmpty" }).sql,
    ).toContain("NOT EXISTS")
    expect(
      renderCondition({ field: "sentMessage", operator: "isNotEmpty" }).sql,
    ).not.toContain("NOT EXISTS")
  })

  test("normalizes the query value exactly like the stored text", () => {
    const query = renderCondition({
      field: "sentMessage",
      operator: "eq",
      value: "  Xin Chào ĐẸP ",
    })
    expect(query.params).toEqual([WORKSPACE_ID, "xin chao dep"])
  })

  test("escapes LIKE wildcards in the value", () => {
    expect(
      renderCondition({
        field: "sentMessage",
        operator: "contains",
        value: "100%_off",
      }).params,
    ).toEqual([WORKSPACE_ID, "%100\\%\\_off%"])
    expect(
      renderCondition({
        field: "sentMessage",
        operator: "startsWith",
        value: "a\\b",
      }).params,
    ).toEqual([WORKSPACE_ID, "a\\\\b%"])
  })

  test("scopes by a parameterized workspaceId", () => {
    const query = renderCondition({
      field: "sentMessage",
      operator: "eq",
      value: "hi",
    })
    expect(query.sql).toContain('m."workspaceId" = $1::bigint')
  })

  test.each([
    ["an empty value", ""],
    ["a blank value", "   "],
    ["no value", undefined],
    ["a non-string value", ["hi"]],
    ["an oversized value", "x".repeat(1001)],
  ])("fails closed for %s", (_label, value) => {
    expect(
      renderCondition({ field: "sentMessage", operator: "contains", value })
        .sql,
    ).toContain("FALSE")
  })

  test("text that is blank once normalized fails closed instead of matching every message", () => {
    // U+0301 alone folds to an empty string, i.e. LIKE '%%'.
    for (const operator of [
      "contains",
      "startsWith",
      "endsWith",
      "eq",
      "notContains",
    ]) {
      expect(
        renderCondition({
          field: "sentMessage",
          operator,
          value: "\u0301",
        }).sql,
      ).toContain("FALSE")
    }
  })

  test("fails closed for an unsupported operator or without a workspace", () => {
    expect(
      renderCondition({ field: "sentMessage", operator: "gt", value: "x" }).sql,
    ).toContain("FALSE")
    expect(
      renderCondition(
        { field: "sentMessage", operator: "eq", value: "x" },
        null,
      ).sql,
    ).toContain("FALSE")
  })
})

describe("lastDelivered", () => {
  test.each([
    "eq",
    "gt",
    "gte",
    "lt",
    "lte",
  ])("%s compares the contact's lastDeliveredAt inside EXISTS", (operator) => {
    const query = renderCondition({
      field: "lastDelivered",
      operator,
      value: "2026-05-19",
    })
    expect(query.sql).toContain('FROM "ContactState" s')
    expect(query.sql).toContain('s."lastDeliveredAt"')
    expect(query.sql).not.toContain("NOT EXISTS")
    expect(query.sql).toContain('s."workspaceId" = $1::bigint')
  })

  test("isBetween is a positive EXISTS over the window", () => {
    const query = renderCondition({
      field: "lastDelivered",
      operator: "isBetween",
      value: ["2026-05-01", "2026-05-31"],
    })
    expect(query.sql).not.toContain("NOT EXISTS")
    expect(query.sql).toContain("::timestamptz")
  })

  test.each([
    ["ne", "2026-05-19"],
    ["notBetween", ["2026-05-01", "2026-05-31"]],
  ])("%s is NOT EXISTS so a contact with no delivery is included", (operator, value) => {
    const query = renderCondition({ field: "lastDelivered", operator, value })
    expect(query.sql).toContain("NOT EXISTS")
    expect(query.sql).not.toContain("IS NULL OR")
  })

  test("isEmpty is NOT EXISTS of a value, isNotEmpty is EXISTS", () => {
    const empty = renderCondition({
      field: "lastDelivered",
      operator: "isEmpty",
    })
    const notEmpty = renderCondition({
      field: "lastDelivered",
      operator: "isNotEmpty",
    })
    expect(empty.sql).toContain("NOT EXISTS")
    expect(empty.sql).toContain('"lastDeliveredAt" IS NOT NULL')
    expect(notEmpty.sql).not.toContain("NOT EXISTS")
  })

  test("interprets a naive date in the filter's timezone", () => {
    const utc = renderCondition({
      field: "lastDelivered",
      operator: "eq",
      value: "2026-05-19",
    })
    const tokyo = renderCondition(
      { field: "lastDelivered", operator: "eq", value: "2026-05-19" },
      WORKSPACE_ID,
      "Asia/Tokyo",
    )
    expect(utc.params).not.toEqual(tokyo.params)
  })

  test.each([
    ["an unusable date", "eq", "not-a-date"],
    ["no value", "gt", undefined],
    ["an unsupported operator", "contains", "2026-05-19"],
  ])("fails closed for %s", (_label, operator, value) => {
    expect(
      renderCondition({ field: "lastDelivered", operator, value }).sql,
    ).toContain("FALSE")
  })

  test("fails closed without a workspace", () => {
    expect(
      renderCondition({ field: "lastDelivered", operator: "isEmpty" }, null)
        .sql,
    ).toContain("FALSE")
  })
})

describe("activity filters kill switch", () => {
  afterEach(() => {
    env.CONTACT_ACTIVITY_FILTERS_ENABLED = true
  })

  test("every activity condition fails closed when the switch is off", () => {
    env.CONTACT_ACTIVITY_FILTERS_ENABLED = false
    const conditions = [
      { field: "executedFlow", operator: "in", value: ["5"] },
      { field: "sentMessage", operator: "eq", value: "hi" },
      { field: "lastDelivered", operator: "isEmpty" },
    ]

    for (const condition of conditions) {
      const query = renderCondition(condition)
      expect(query.sql).toContain("FALSE")
      expect(query.sql).not.toContain("ContactActivity")
      expect(query.sql).not.toContain("ContactKeywordMessage")
      expect(query.sql).not.toContain("ContactState")
    }
  })

  test("the conditions work again once it is back on", () => {
    expect(
      renderCondition({ field: "executedFlow", operator: "in", value: ["5"] })
        .sql,
    ).toContain("ContactActivity")
  })
})
