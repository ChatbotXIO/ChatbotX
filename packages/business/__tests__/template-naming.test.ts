// @vitest-environment node

import { DrizzleQueryError } from "drizzle-orm/errors"
import { describe, expect, test, vi } from "vitest"
import { insertWithNameRetry } from "../src/template/adapters/naming"

const uniqueViolation = (constraint: string) =>
  new DrizzleQueryError("insert", [], { code: "23505", constraint })

/**
 * A fake `DatabaseClient` whose `.transaction()` mimics a real Postgres
 * SAVEPOINT: a rejection inside one call never affects a later call on the
 * same instance — proving `insertWithNameRetry` isolates each retry attempt
 * rather than relying on the outer install transaction surviving a caught
 * 23505 (which, on real Postgres, it cannot).
 */
const fakeTx = () => {
  const instance = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(instance),
    ),
  }
  return instance as unknown as Parameters<typeof insertWithNameRetry>[0]
}

describe("insertWithNameRetry", () => {
  test("suffixes the name on a matching unique-constraint violation so both rows can exist", async () => {
    // Simulates a prior insert in the SAME install having already taken
    // "Welcome" — this call must suffix rather than collide.
    const created = ["Welcome"]
    const insert = vi.fn((_tx: unknown, candidateName: string) => {
      if (created.includes(candidateName)) {
        throw uniqueViolation("Trigger_workspaceId_name_key")
      }
      created.push(candidateName)
      return Promise.resolve({ id: candidateName })
    })
    const onGiveUp = vi.fn()
    const tx = fakeTx()

    const second = await insertWithNameRetry(
      tx,
      "Trigger_workspaceId_name_key",
      "Welcome",
      insert,
      onGiveUp,
    )

    expect(second).toEqual({ id: "Welcome (2)" })
    expect(onGiveUp).not.toHaveBeenCalled()
    expect(created).toEqual(["Welcome", "Welcome (2)"])
  })

  test("does not poison later attempts when an earlier attempt's savepoint failed", async () => {
    let attempts = 0
    const insert = vi.fn((_tx: unknown, candidateName: string) => {
      attempts++
      if (attempts < 3) {
        throw uniqueViolation("Trigger_workspaceId_name_key")
      }
      return Promise.resolve({ id: candidateName })
    })
    const tx = fakeTx()

    const result = await insertWithNameRetry(
      tx,
      "Trigger_workspaceId_name_key",
      "Welcome",
      insert,
      vi.fn(),
    )

    expect(result).toEqual({ id: "Welcome (3)" })
    expect(attempts).toBe(3)
  })

  test("rethrows immediately on a non-matching constraint instead of retrying", async () => {
    const insert = vi.fn(() => {
      throw uniqueViolation("SomeOther_key")
    })
    const onGiveUp = vi.fn()
    const tx = fakeTx()

    await expect(
      insertWithNameRetry(
        tx,
        "Trigger_workspaceId_name_key",
        "Welcome",
        insert,
        onGiveUp,
      ),
    ).rejects.toThrow()

    expect(insert).toHaveBeenCalledTimes(1)
    expect(onGiveUp).not.toHaveBeenCalled()
  })

  test("gives up after exhausting all retry attempts", async () => {
    const insert = vi.fn(() => {
      throw uniqueViolation("Trigger_workspaceId_name_key")
    })
    const onGiveUp = vi.fn()
    const tx = fakeTx()

    const result = await insertWithNameRetry(
      tx,
      "Trigger_workspaceId_name_key",
      "Welcome",
      insert,
      onGiveUp,
    )

    expect(result).toBeUndefined()
    expect(onGiveUp).toHaveBeenCalledWith("Welcome (20)")
  })
})
