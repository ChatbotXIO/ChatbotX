import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import {
  decodePipelineItemCursor,
  encodePipelineItemCursor,
  InvalidPipelineCursorError,
  type PipelineItemCursor,
  type PipelineItemSort,
  pipelineItemAfterCursor,
  pipelineItemOrderBy,
} from "../src/repositories/pipeline/item-cursor"
import { buildPipelineItemWhere } from "../src/repositories/pipeline/item-filter"

const dialect = new PgDialect()
const ROW_COMPARISON_AFTER = /\(\(.+, .+\) > \(.+, .+::bigint\)\)/
const render = (query: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  dialect.sqlToQuery(query)

const SORT_VALUE_DESC: PipelineItemSort = { key: "value", direction: "desc" }
const SORT_CREATED_ASC: PipelineItemSort = {
  key: "createdAt",
  direction: "asc",
}

const GUARDED_CAST = /case when .* ~ \$\d+ then .*::timestamptz end/
const GUARDED_NUMERIC_CAST = /case when .* ~ \$\d+ then .*::numeric end/

describe("pipeline item cursor", () => {
  const cursor: PipelineItemCursor = {
    v: 1,
    sort: "value",
    dir: "desc",
    nullRank: 0,
    sortValue: "12.5000",
    id: "42",
  }

  test("round-trips through encode and decode", () => {
    const decoded = decodePipelineItemCursor(
      encodePipelineItemCursor(cursor),
      SORT_VALUE_DESC,
    )

    expect(decoded).toEqual(cursor)
  })

  test("rejects a cursor issued for another sort", () => {
    const encoded = encodePipelineItemCursor(cursor)

    expect(() => decodePipelineItemCursor(encoded, SORT_CREATED_ASC)).toThrow(
      InvalidPipelineCursorError,
    )
  })

  const encodeFor = (overrides: Partial<PipelineItemCursor>) =>
    encodePipelineItemCursor({ ...cursor, ...overrides })

  test.each<[string, string, PipelineItemSort]>([
    ["not base64 json", "%%%", SORT_VALUE_DESC],
    ["a JSON null", Buffer.from("null").toString("base64url"), SORT_VALUE_DESC],
    ["a non numeric id", encodeFor({ id: "1; drop table" }), SORT_VALUE_DESC],
    [
      "a non null rank without a value",
      encodeFor({ sortValue: null }),
      SORT_VALUE_DESC,
    ],
    [
      "a null rank carrying a value",
      encodeFor({ nullRank: 1 }),
      SORT_VALUE_DESC,
    ],
    [
      "a non numeric value for the value sort",
      encodeFor({ sortValue: "abc" }),
      SORT_VALUE_DESC,
    ],
    [
      "a non timestamp value for a timestamp sort",
      encodeFor({ sort: "createdAt", dir: "asc", sortValue: "abc" }),
      SORT_CREATED_ASC,
    ],
    [
      "the wrong version",
      Buffer.from(JSON.stringify({ ...cursor, v: 2 })).toString("base64url"),
      SORT_VALUE_DESC,
    ],
  ])("rejects %s", (_name, raw, sort) => {
    expect(() => decodePipelineItemCursor(raw, sort)).toThrow(
      InvalidPipelineCursorError,
    )
  })

  test.each([
    ["an id that overflows a signed bigint", { id: "9223372036854775808" }],
    ["an id longer than 19 digits", { id: "10000000000000000000" }],
    [
      "month 99",
      { sort: "createdAt", dir: "asc", sortValue: "2026-99-25 15:55:32+00" },
    ],
    [
      "day 32",
      { sort: "createdAt", dir: "asc", sortValue: "2026-10-32 15:55:32+00" },
    ],
    [
      "hour 25",
      { sort: "createdAt", dir: "asc", sortValue: "2026-10-25 25:55:32+00" },
    ],
    [
      "minute 60",
      { sort: "createdAt", dir: "asc", sortValue: "2026-10-25 15:60:32+00" },
    ],
    [
      "an offset of 16 hours",
      { sort: "createdAt", dir: "asc", sortValue: "2026-10-25 15:55:32+16" },
    ],
    ["an absurdly long numeric value", { sortValue: `${"9".repeat(40)}.5` }],
  ] as [
    string,
    Partial<PipelineItemCursor>,
  ][])("rejects out-of-range %s", (_name, overrides) => {
    const sort =
      overrides.sort === "createdAt" ? SORT_CREATED_ASC : SORT_VALUE_DESC
    expect(() => decodePipelineItemCursor(encodeFor(overrides), sort)).toThrow(
      InvalidPipelineCursorError,
    )
  })

  test("accepts the largest signed bigint id", () => {
    const raw = encodeFor({ id: "9223372036854775807" })

    expect(decodePipelineItemCursor(raw, SORT_VALUE_DESC).id).toBe(
      "9223372036854775807",
    )
  })

  test.each([
    "20000-01-01 00:00:00+00",
    "1900-01-01 07:06:30+07:06:30",
    "0044-03-15 12:00:00+00 BC",
    "2026-10-25 15:55:32.5+05:30",
  ])("accepts the Postgres timestamptz text %s", (sortValue) => {
    const raw = encodeFor({ sort: "createdAt", dir: "asc", sortValue })

    expect(decodePipelineItemCursor(raw, SORT_CREATED_ASC).sortValue).toBe(
      sortValue,
    )
  })

  test("accepts a Postgres timestamptz text value", () => {
    const raw = encodeFor({
      sort: "createdAt",
      dir: "asc",
      sortValue: "2026-10-25 15:55:32.123456+00",
    })

    expect(decodePipelineItemCursor(raw, SORT_CREATED_ASC).id).toBe("42")
  })
})

describe("pipeline item ordering", () => {
  test("omits the null-rank term for sort keys that cannot be NULL", () => {
    const parts = pipelineItemOrderBy(SORT_CREATED_ASC).map(
      (part) => render(part).sql,
    )

    expect(parts).toHaveLength(2)
    expect(parts.join(" ").includes("0 asc")).toBe(false)
  })

  test("puts NULL sort values last and breaks ties by id", () => {
    const parts = pipelineItemOrderBy(SORT_VALUE_DESC).map(
      (part) => render(part).sql,
    )
    const rendered = parts.join(", ")

    expect(parts[0]).toContain("is null")
    expect(rendered).toContain("desc")
    expect(rendered.trim().endsWith("desc")).toBe(true)
  })

  test("keyset after a non-null value includes NULL rows and binds the value", () => {
    const predicate = render(
      pipelineItemAfterCursor(SORT_VALUE_DESC, {
        v: 1,
        sort: "value",
        dir: "desc",
        nullRank: 0,
        sortValue: "12.5",
        id: "42",
      }),
    )

    expect(predicate.sql).toContain("is null or")
    expect(predicate.sql).toContain("<")
    expect(predicate.params).toContain("12.5")
    expect(predicate.params).toContain("42")
  })

  test("keyset after a NULL value only walks the remaining NULL rows by id", () => {
    const predicate = render(
      pipelineItemAfterCursor(SORT_VALUE_DESC, {
        v: 1,
        sort: "value",
        dir: "desc",
        nullRank: 1,
        sortValue: null,
        id: "42",
      }),
    )

    expect(predicate.sql).toContain("is null")
    expect(predicate.sql).not.toContain("or")
  })

  test("keyset over a non-nullable key is one row comparison the index can start from", () => {
    const predicate = render(
      pipelineItemAfterCursor(SORT_CREATED_ASC, {
        v: 1,
        sort: "createdAt",
        dir: "asc",
        nullRank: 0,
        sortValue: "2026-01-01 00:00:00.123456+00",
        id: "42",
      }),
    )

    expect(predicate.sql).toMatch(ROW_COMPARISON_AFTER)
    expect(predicate.sql).not.toContain(" or ")
    expect(predicate.params).toEqual(["2026-01-01 00:00:00.123456+00", "42"])
  })
})

describe("buildPipelineItemWhere", () => {
  test("always scopes by workspace and binds filter values as parameters", () => {
    const where = render(
      buildPipelineItemWhere(
        { workspaceId: "7", pipelineId: "9" },
        {
          statuses: ["open"],
          search: "'; drop table x; --",
          fieldConditions: { "55": { operator: "is", value: "gold" } },
          fieldTypes: { "55": "shortText" },
        },
      ),
    )

    expect(where.sql).toContain('"workspaceId"')
    expect(where.sql).not.toContain("drop table")
    expect(where.params).toContain("7")
    expect(where.params).toContain("gold")
    expect(where.params).toContain("55")
  })

  test("treats a numeric search as an item number lookup", () => {
    const where = render(
      buildPipelineItemWhere({ workspaceId: "7" }, { search: "#123" }),
    )

    expect(where.params).toContain("123")
  })

  // A short number is an item-number/title lookup: it must not match every
  // email (e.g. webchat guest identifiers) or phone that contains the digit.
  test.each([
    ["9", { email: false, phone: false }],
    ["ann", { email: false, phone: false }],
    ["ann@example", { email: true, phone: false }],
    ["0901 234", { email: false, phone: true }],
    ["+84 90-123", { email: false, phone: true }],
  ])("search %j checks email %o", (search, expected) => {
    const where = render(
      buildPipelineItemWhere({ workspaceId: "7" }, { search }),
    )

    expect(where.sql.includes('"email"')).toBe(expected.email)
    expect(where.sql.includes('"phoneNumber"')).toBe(expected.phone)
    expect(where.sql).toContain('"fullName"')
  })

  test("a phone search matches the digits whatever the formatting", () => {
    const where = render(
      buildPipelineItemWhere({ workspaceId: "7" }, { search: "+84 (90) 123" }),
    )

    expect(where.params).toContain("%8490123%")
  })

  test("closedAs pairs the status with its closure range as bound params", () => {
    const from = new Date("2026-01-01T00:00:00.000Z")
    const to = new Date("2026-01-31T23:59:59.999Z")
    const where = render(
      buildPipelineItemWhere(
        { workspaceId: "7" },
        { closedAs: { won: { from, to }, lost: { from } } },
      ),
    )

    expect(where.sql).toContain('"status" = $')
    expect(where.sql).toContain(" or ")
    expect(where.sql).not.toContain("won")
    expect(where.params).toEqual(
      expect.arrayContaining([
        "won",
        "lost",
        from.toISOString(),
        to.toISOString(),
      ]),
    )
  })

  test("closedAs with a single status adds no OR", () => {
    const from = new Date("2026-01-01T00:00:00.000Z")
    const where = render(
      buildPipelineItemWhere(
        { workspaceId: "7" },
        { closedAs: { won: { from } } },
      ),
    )

    expect(where.sql).not.toContain(" or ")
  })

  test("binds the item's own comment, status and stage timestamps", () => {
    const from = new Date("2026-01-01T00:00:00.000Z")
    const where = render(
      buildPipelineItemWhere(
        { workspaceId: "7" },
        {
          lastCommentAt: { from },
          statusChangedAt: { from },
          stageEnteredAt: { from },
        },
      ),
    )

    expect(where.sql).toContain('"lastCommentAt" >=')
    expect(where.sql).toContain('"statusChangedAt" >=')
    expect(where.sql).toContain('"stageEnteredAt" >=')
    expect(where.sql).not.toContain("PipelineItemActivity")
  })

  test("a date condition binds key, day operand and zone, with a guarded cast", () => {
    const where = render(
      buildPipelineItemWhere(
        { workspaceId: "7" },
        {
          fieldConditions: {
            "99": {
              operator: "between",
              value: "2026-05-01",
              valueTo: "2026-05-31",
            },
          },
          fieldTypes: { "99": "datetime" },
          timezone: "Asia/Ho_Chi_Minh",
        },
      ),
    )

    // The cast only runs inside a CASE guarded by the pattern check.
    expect(where.sql).toMatch(GUARDED_CAST)
    expect(where.sql).toContain("at time zone")
    expect(where.params).toEqual(
      expect.arrayContaining([
        "99",
        "2026-05-01",
        "2026-05-31",
        "Asia/Ho_Chi_Minh",
      ]),
    )
    expect(where.sql).not.toContain("99")
  })

  test("an unknown timezone falls back to UTC instead of reaching SQL", () => {
    const where = render(
      buildPipelineItemWhere(
        { workspaceId: "7" },
        {
          fieldConditions: { "99": { operator: "is", value: "2026-05-01" } },
          // Only date & time fields project through a timezone.
          fieldTypes: { "99": "datetime" },
          timezone: "Mars/Olympus'; drop table x",
        },
      ),
    )

    expect(where.params).toContain("UTC")
    expect(where.params).not.toContain("Mars/Olympus'; drop table x")
  })

  test("value operators bind the amount and keep the legacy interval", () => {
    const sqlOf = (value: Parameters<typeof buildPipelineItemWhere>[1]) =>
      render(buildPipelineItemWhere({ workspaceId: "7" }, value))

    const eq = sqlOf({ value: { operator: "eq", amount: 5 } })
    expect(eq.sql).toContain('"value" =')
    expect(eq.params).toContain("5")
    expect(sqlOf({ value: { operator: "gt", amount: 5 } }).sql).toContain(
      '"value" >',
    )
    expect(sqlOf({ value: { operator: "lt", amount: 5 } }).sql).toContain(
      '"value" <',
    )
    expect(sqlOf({ value: { operator: "ne", amount: 5 } }).sql).toContain(
      "is distinct from",
    )
    const between = sqlOf({ value: { operator: "between", min: 1, max: 9 } })
    expect(between.sql).toContain('"value" >=')
    expect(between.sql).toContain('"value" <=')
    expect(sqlOf({ value: { min: 1 } }).sql).toContain('"value" >=')
    // A single-amount operator without an amount adds nothing.
    expect(sqlOf({ value: { operator: "gt" } }).sql).toBe(sqlOf({}).sql)
  })

  test("field conditions bind keys and operands and never interpolate them", () => {
    const where = render(
      buildPipelineItemWhere(
        { workspaceId: "7" },
        {
          fieldConditions: {
            "11": { operator: "contains", value: "50%_x" },
            "12": { operator: "startsWith", value: "ab" },
            "13": { operator: "endsWith", value: "yz" },
            "14": { operator: "gt", value: "3" },
            "15": { operator: "noValue" },
          },
          fieldTypes: {
            "11": "shortText",
            "12": "email",
            "13": "longText",
            "14": "number",
            "15": "number",
          },
        },
      ),
    )

    expect(where.params).toEqual(
      expect.arrayContaining(["11", "%50\\%\\_x%", "ab%", "%yz", "3", "15"]),
    )
    expect(where.sql).toContain("ilike")
    expect(where.sql).toMatch(GUARDED_NUMERIC_CAST)
    expect(where.sql).not.toContain("50%")
  })

  test("a condition missing its operand, its field type or a usable operand adds nothing", () => {
    const plain = render(buildPipelineItemWhere({ workspaceId: "7" }, {}))
    const where = render(
      buildPipelineItemWhere(
        { workspaceId: "7" },
        {
          fieldConditions: {
            "11": { operator: "contains" },
            "12": { operator: "is", value: "abc" },
            "13": { operator: "is", value: "" },
            "14": { operator: "gt", value: "2026-02-30" },
            "15": { operator: "is", value: "maybe" },
            "16": { operator: "between" },
            "17": { operator: "is", value: "typeless" },
          },
          fieldTypes: {
            "11": "shortText",
            "12": "number",
            "13": "shortText",
            "14": "date",
            "15": "boolean",
            "16": "number",
          },
        },
      ),
    )

    expect(where.sql).toBe(plain.sql)
  })

  test("closedAs without a range adds no condition", () => {
    const plain = render(buildPipelineItemWhere({ workspaceId: "7" }, {}))
    const empty = render(
      buildPipelineItemWhere({ workspaceId: "7" }, { closedAs: {} }),
    )

    expect(empty.sql).toBe(plain.sql)
  })
})
