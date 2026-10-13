import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { occurrenceBucketGranularities } from "../src/partials/broadcast"
import { zonedBucketKey } from "../src/queries/date-bucket"
import { broadcastModel } from "../src/schema"

const dialect = new PgDialect()
const render = (granularity: (typeof occurrenceBucketGranularities)[number]) =>
  dialect.sqlToQuery(
    zonedBucketKey(broadcastModel.occurrenceAt, granularity, "Asia/Saigon"),
  )

describe("zonedBucketKey", () => {
  test.each([
    ["day", "'day'"],
    ["week", "'week'"],
    ["month", "'month'"],
  ] as const)("%s truncates with a fixed literal unit", (granularity, unit) => {
    const { sql } = render(granularity)
    expect(sql).toContain(`date_trunc(${unit},`)
    expect(sql).toContain("to_char(")
    expect(sql).toContain("'YYYY-MM-DD'")
  })

  test("the timezone travels as bound parameters, never inlined", () => {
    const { sql, params } = render("day")
    expect(sql).not.toContain("Saigon")
    expect(params).toContain("Asia/Saigon")
    // Resolved by PostgreSQL itself so a legacy alias cannot abort the statement.
    expect(sql).toContain("pg_timezone_names")
  })

  test("only the three supported units exist", () => {
    expect(occurrenceBucketGranularities).toEqual(["day", "week", "month"])
  })
})
