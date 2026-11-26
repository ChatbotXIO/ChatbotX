import { drizzle } from "drizzle-orm/node-postgres"
import { describe, expect, test } from "vitest"
import { relations } from "../src/relations"

/**
 * drizzle-orm 1.0 relational queries load a nested `with:` relation through
 * `json_agg(row_to_json(...))`. A `bigint` that reaches JSON uncast is parsed
 * as a JS number and loses its last digits above 2^53 (…495 → …496), so code
 * that writes back by a nested id silently updates no row. `bigintAsString`
 * columns must be cast to text inside JSON selections.
 *
 * The round trip with production-size ids against a real database lives in
 * `integration/bigint-as-string-json.test.ts`.
 */
describe("bigintAsString inside relational (JSON) selections", () => {
  const mockDb = drizzle.mock({ relations })

  test("casts nested bigint columns to text", () => {
    const query = mockDb.query.flowModel
      .findFirst({ with: { flowVersions: true } })
      .toSQL()

    expect(query.sql).toContain('"d1"."id"::text')
    expect(query.sql).toContain('"d1"."flowId"::text')
  })

  test("casts nested bigint array columns to text[]", () => {
    const query = mockDb.query.commentAutomationModel
      .findFirst({ with: { folder: true } })
      .toSQL()

    expect(query.sql).toContain('"paths"::text[]')
  })
})
