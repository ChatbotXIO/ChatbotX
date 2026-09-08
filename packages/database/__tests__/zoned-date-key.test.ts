import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { zonedDateKey } from "../src/queries/date-bucket"
import { contactInboxModel } from "../src/schema"

const render = (timezone: string) =>
  new PgDialect().sqlToQuery(
    zonedDateKey(contactInboxModel.firstInteractionAt, timezone),
  )

describe("zonedDateKey", () => {
  // Regression: a `tz=Asia/Saigon` URL param reached `AT TIME ZONE` verbatim
  // and PostgreSQL aborted with 22023 "time zone not recognized", rejecting the
  // whole dashboard request. Both spellings must be offered so the database
  // picks whichever its tzdata carries.
  test("offers the canonical spelling alongside a legacy timezone name", () => {
    const query = render("Asia/Saigon")

    expect(query.params).toContain("Asia/Saigon")
    expect(query.params).toContain("Asia/Ho_Chi_Minh")
  })

  test("offers the legacy spelling alongside a canonical timezone name", () => {
    const query = render("Asia/Ho_Chi_Minh")

    expect(query.params).toContain("Asia/Ho_Chi_Minh")
    expect(query.params).toContain("Asia/Saigon")
  })

  test("prefers the caller's own spelling when the database knows both", () => {
    const query = render("Asia/Saigon")

    // `ORDER BY (name = <preferred>) DESC` — the preferred parameter is bound
    // after the IN list, so it is the last occurrence.
    expect(query.params.at(-1)).toBe("Asia/Saigon")
  })

  test("never interpolates the timezone name into the statement text", () => {
    const query = render("Asia/Saigon")

    expect(query.sql).not.toContain("Asia/Saigon")
    expect(query.sql).toContain("pg_timezone_names")
  })

  test("falls back to UTC for a timezone the database does not recognize", () => {
    const query = render("Not/AZone")

    expect(query.sql).toContain("'UTC'")
    expect(query.params).toContain("Not/AZone")
  })
})
