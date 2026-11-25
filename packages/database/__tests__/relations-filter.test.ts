import { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { relationsFilterToSQL } from "../src/relations-filter"
import { contactModel } from "../src/schema"

const render = (sql: SQL) => new PgDialect().sqlToQuery(sql)

describe("relationsFilterToSQL wrapper", () => {
  test("returns undefined for an empty filter", () => {
    expect(relationsFilterToSQL(contactModel, {} as never)).toBeUndefined()
  })

  test("returns an SQL instance (not the rc { sql } envelope) for a real filter", () => {
    const result = relationsFilterToSQL(contactModel, {
      workspaceId: "ws-1",
    } as never)

    expect(result).toBeInstanceOf(SQL)
    const { sql, params } = render(result as SQL)
    expect(sql).toContain("workspaceId")
    expect(params).toContain("ws-1")
  })

  test("drops undefined values instead of throwing (beta semantics)", () => {
    const withUndefined = relationsFilterToSQL(contactModel, {
      workspaceId: "ws-1",
      id: undefined,
    } as never)
    const without = relationsFilterToSQL(contactModel, {
      workspaceId: "ws-1",
    } as never)

    expect(render(withUndefined as SQL)).toEqual(render(without as SQL))
  })

  test("returns undefined when every key is undefined", () => {
    expect(
      relationsFilterToSQL(contactModel, { id: undefined } as never),
    ).toBeUndefined()
  })

  test("strips undefined inside nested AND/OR arrays", () => {
    const nested = relationsFilterToSQL(contactModel, {
      AND: [{ workspaceId: "ws-1", id: undefined }],
      OR: [{ id: undefined }, { workspaceId: "ws-2" }],
    } as never)
    const clean = relationsFilterToSQL(contactModel, {
      AND: [{ workspaceId: "ws-1" }],
      OR: [{}, { workspaceId: "ws-2" }],
    } as never)

    expect(nested).toBeInstanceOf(SQL)
    expect(render(nested as SQL)).toEqual(render(clean as SQL))
  })

  test("keeps function-valued RAW filters intact", () => {
    const result = relationsFilterToSQL(contactModel, {
      RAW: (table: typeof contactModel) => new SQL([table.id.name]),
    } as never)

    expect(result).toBeInstanceOf(SQL)
  })
})
