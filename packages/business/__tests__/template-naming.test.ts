// @vitest-environment node

import { DrizzleQueryError } from "drizzle-orm/errors"
import { describe, expect, test, vi } from "vitest"
import {
  insertCopyNamed,
  insertWithCopyName,
} from "../src/template/adapters/naming"

const TRAILING_WILDCARD = /%$/

const uniqueViolation = (constraint: string) =>
  new DrizzleQueryError("insert", [], { code: "23505", constraint })

/**
 * A fake `DatabaseClient` whose `.transaction()` mimics a real Postgres
 * SAVEPOINT: a rejection inside one call never affects a later call on the
 * same instance — proving `insertWithCopyName` isolates each retry attempt
 * rather than relying on the outer install transaction surviving a caught
 * 23505 (which, on real Postgres, it cannot).
 */
const fakeTx = () => {
  const instance = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(instance),
    ),
  }
  return instance as unknown as Parameters<typeof insertWithCopyName>[0]["tx"]
}

describe("insertCopyNamed", () => {
  const buildCtx = (tx: unknown) => ({ tx, warn: vi.fn() }) as never

  test("a trigger name that is taken installs as '<name> - Copy', then '- Copy 2'", async () => {
    const existing = new Set(["Welcome"])
    const insert = vi.fn((_tx: unknown, name: string) => {
      if (existing.has(name)) {
        throw uniqueViolation("Trigger_workspaceId_name_key")
      }
      existing.add(name)
      return Promise.resolve(name)
    })
    const findTaken = vi.fn(async (_tx: unknown, filter: { like: string }) =>
      [...existing]
        .filter((name) =>
          name.startsWith(filter.like.replace(TRAILING_WILDCARD, "")),
        )
        .map((name) => ({ name })),
    )
    const tx = fakeTx()
    const ctx = buildCtx(tx)
    const run = () =>
      insertCopyNamed(ctx, {
        category: "triggers",
        constraint: "Trigger_workspaceId_name_key",
        entry: { sourceId: "t1", name: "Welcome" },
        findTaken,
        insert,
      })

    expect(await run()).toBe("Welcome - Copy")
    expect(await run()).toBe("Welcome - Copy 2")
    expect(findTaken).toHaveBeenCalledTimes(1)
  })

  test("rethrows a violation of another constraint instead of renaming", async () => {
    const insert = vi.fn(() => {
      throw uniqueViolation("SomeOther_key")
    })
    const ctx = buildCtx(fakeTx())

    await expect(
      insertCopyNamed(ctx, {
        category: "triggers",
        constraint: "Trigger_workspaceId_name_key",
        entry: { sourceId: "t1", name: "Welcome" },
        findTaken: vi.fn(),
        insert,
      }),
    ).rejects.toThrow()
    expect(insert).toHaveBeenCalledTimes(1)
  })

  test("warns '<category>.<sourceId>.name' when every candidate name is taken", async () => {
    const insert = vi.fn(() => {
      throw uniqueViolation("Reflink_workspaceId_name_key")
    })
    const ctx = buildCtx(fakeTx())

    const result = await insertCopyNamed(ctx, {
      category: "entryPointLinks",
      constraint: "Reflink_workspaceId_name_key",
      entry: { sourceId: "r1", name: "Link" },
      findTaken: vi.fn(async () => []),
      insert,
    })

    expect(result).toBeUndefined()
    expect(ctx.warn).toHaveBeenCalledWith({
      category: "entryPointLinks",
      entityKind: "name",
      path: "entryPointLinks.r1.name",
      value: "Link",
    })
  })
})

describe("insertWithCopyName", () => {
  test("reads the existing names once per prefix and learns the names it inserts", async () => {
    const existing = new Set(["Welcome"])
    const insert = vi.fn((_tx: unknown, name: string) => {
      if (existing.has(name)) {
        throw uniqueViolation("Sequence_workspaceId_name_key")
      }
      existing.add(name)
      return Promise.resolve(name)
    })
    const loadTakenNames = vi.fn(async (_tx: unknown, prefix: string) =>
      [...existing].filter((name) => name.startsWith(prefix)),
    )
    const tx = fakeTx() as Parameters<typeof insertWithCopyName>[0]["tx"]
    const run = () =>
      insertWithCopyName({
        tx,
        constraint: "Sequence_workspaceId_name_key",
        name: "Welcome",
        loadTakenNames,
        insert,
        onGiveUp: vi.fn(),
      })

    const first = await run()
    const second = await run()

    expect(first).toBe("Welcome - Copy")
    expect(second).toBe("Welcome - Copy 2")
    expect(loadTakenNames).toHaveBeenCalledTimes(1)
    expect(loadTakenNames).toHaveBeenCalledWith(tx, "Welcome - Copy")
  })
})
