import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, expectTypeOf, test, vi } from "vitest"
import {
  type StatementTimeout,
  setLocalStatementTimeout,
} from "../src/statement-timeout"

const render = (execute: ReturnType<typeof vi.fn>) =>
  new PgDialect().sqlToQuery(execute.mock.calls[0][0])

describe("setLocalStatementTimeout", () => {
  test.each<StatementTimeout>([
    "10s",
    "250ms",
  ])("issues SET LOCAL statement_timeout with the %s literal inline", async (timeout) => {
    const execute = vi.fn().mockResolvedValue(undefined)

    await setLocalStatementTimeout({ execute }, timeout)

    expect(execute).toHaveBeenCalledOnce()
    const { sql, params } = render(execute)
    // `SET` rejects bind parameters, so the literal must be spliced inline
    // and nothing may be sent as a parameter.
    expect(sql).toBe(`SET LOCAL statement_timeout = '${timeout}'`)
    expect(params).toEqual([])
  })

  test.each([
    "10s; DROP TABLE x",
    "10",
    "1.5s",
    "-1s",
    "10 s",
    "",
  ])("refuses %j at runtime before any SQL is built", async (invalid) => {
    const execute = vi.fn().mockResolvedValue(undefined)

    await expect(
      // The cast stands in for a JavaScript caller or an unsafe cast in TS —
      // exactly the boundary the runtime guard exists for.
      setLocalStatementTimeout({ execute }, invalid as StatementTimeout),
    ).rejects.toBeInstanceOf(RangeError)

    expect(execute).not.toHaveBeenCalled()
  })

  test("accepts only numeric duration literals at the type level", () => {
    expectTypeOf<"10s">().toExtend<StatementTimeout>()
    expectTypeOf<"250ms">().toExtend<StatementTimeout>()
    expectTypeOf<"10s; DROP TABLE x">().not.toExtend<StatementTimeout>()
    expectTypeOf<10>().not.toExtend<StatementTimeout>()
  })
})
