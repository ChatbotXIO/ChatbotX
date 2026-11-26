import { DrizzleQueryError } from "drizzle-orm"
import { describe, expect, test } from "vitest"
import {
  describeDatabaseError,
  isDeadlockError,
  isLockTimeoutError,
  toLoggableDatabaseError,
} from "../src/client"

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

describe("toLoggableDatabaseError", () => {
  test("keeps the code and the violated constraint, never the bound values", () => {
    const error = new DrizzleQueryError(
      "insert into x",
      ["secret-token"],
      Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint: "Connection_inboxId_key",
      }),
    )

    const loggable = toLoggableDatabaseError(error) as Error

    expect(loggable.message).toBe(
      "Database error (23505 Connection_inboxId_key)",
    )
    expect(
      JSON.stringify(loggable, Object.getOwnPropertyNames(loggable)),
    ).not.toContain("secret-token")
  })
})

describe("isDeadlockError", () => {
  const deadlock = () =>
    Object.assign(new Error("deadlock detected"), { code: "40P01" })

  test("matches SQLSTATE 40P01 carried as the cause of a drizzle query error", () => {
    expect(
      isDeadlockError(new DrizzleQueryError("update x", [], deadlock())),
    ).toBe(true)
  })

  test("ignores other codes and non-database errors", () => {
    const timeout = Object.assign(new Error("timeout"), { code: "57014" })

    expect(
      isDeadlockError(new DrizzleQueryError("update x", [], timeout)),
    ).toBe(false)
    expect(isDeadlockError(deadlock())).toBe(false)
    expect(isDeadlockError(new Error("network failed"))).toBe(false)
    expect(isDeadlockError(null)).toBe(false)
  })
})

describe("isLockTimeoutError", () => {
  const lockTimeout = () =>
    Object.assign(new Error("lock timeout"), { code: "55P03" })

  test("matches SQLSTATE 55P03 carried as the cause of a drizzle query error", () => {
    expect(
      isLockTimeoutError(new DrizzleQueryError("select", [], lockTimeout())),
    ).toBe(true)
  })

  test("ignores other codes and non-database errors", () => {
    const deadlock = Object.assign(new Error("deadlock"), { code: "40P01" })

    expect(
      isLockTimeoutError(new DrizzleQueryError("select", [], deadlock)),
    ).toBe(false)
    expect(isLockTimeoutError(lockTimeout())).toBe(false)
    expect(isLockTimeoutError(undefined)).toBe(false)
  })
})
