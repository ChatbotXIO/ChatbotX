import { describe, expect, test } from "vitest"
import { describeDatabaseError } from "../src/client"

describe("describeDatabaseError", () => {
  test("extracts postgres fields from a nested drizzle cause", () => {
    const pgCause = Object.assign(new Error("statement timeout"), {
      code: "57014",
      detail: "canceling statement due to statement timeout",
      table: "Workspace",
    })
    const error = new Error("Failed query", { cause: pgCause })

    expect(describeDatabaseError(error)).toEqual({
      code: "57014",
      constraint: undefined,
      detail: "canceling statement due to statement timeout",
      message: "statement timeout",
      table: "Workspace",
    })
  })

  test("falls back to the top-level error message when no database code exists", () => {
    expect(describeDatabaseError(new Error("network failed"))).toEqual({
      message: "network failed",
    })
  })
})
