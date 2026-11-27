// @vitest-environment node

import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))

const {
  TemplateLockSetGrownError,
  acquireTemplateResourceLockRequests,
  acquireTemplateResourceLocks,
  sortTemplateLockKeys,
  withTemplateLockedTransaction,
} = await import("../src/template/template-resource-locks")

type Key = { kind: "flow" | "reflink" | "trigger"; resourceId: string }

/** A transaction whose `execute` calls are inspected for the lock keys. */
const makeTx = () => ({
  execute: vi.fn(async (_statement: SQL) => undefined),
})

/** Every value bound into the transaction's statements, in order. */
const boundParams = (tx: ReturnType<typeof makeTx>): unknown[] =>
  tx.execute.mock.calls.flatMap(
    ([statement]) => new PgDialect().sqlToQuery(statement).params,
  )

/** The `tpl-res:` keys the statements locked, in lock order. */
const lockedKeysOf = (tx: ReturnType<typeof makeTx>): string[] =>
  boundParams(tx).filter(
    (param): param is string =>
      typeof param === "string" && param.startsWith("tpl-res:"),
  )

/** The mode flag bound for each locked key, in lock order (`true` = shared). */
const sharedFlagsOf = (tx: ReturnType<typeof makeTx>): boolean[] =>
  boundParams(tx).filter(
    (param): param is boolean => typeof param === "boolean",
  )

describe("sortTemplateLockKeys", () => {
  test("orders by kind, then resource id, and drops duplicates", () => {
    const keys: Key[] = [
      { kind: "trigger", resourceId: "a" },
      { kind: "flow", resourceId: "z" },
      { kind: "flow", resourceId: "b" },
      { kind: "flow", resourceId: "b" },
      { kind: "reflink", resourceId: "m" },
    ]

    expect(sortTemplateLockKeys(keys)).toEqual([
      { kind: "flow", resourceId: "b" },
      { kind: "flow", resourceId: "z" },
      { kind: "reflink", resourceId: "m" },
      { kind: "trigger", resourceId: "a" },
    ])
  })

  test("two writers with the same keys in any order lock in the same order", () => {
    const a: Key[] = [
      { kind: "reflink", resourceId: "r1" },
      { kind: "flow", resourceId: "f1" },
    ]
    const b = [...a].reverse()
    expect(sortTemplateLockKeys(a)).toEqual(sortTemplateLockKeys(b))
  })
})

describe("acquireTemplateResourceLocks", () => {
  test("takes every key in ONE statement, in sorted order", async () => {
    const tx = makeTx()
    await acquireTemplateResourceLocks(tx as never, [
      { kind: "trigger", resourceId: "t1" },
      { kind: "flow", resourceId: "f2" },
      { kind: "flow", resourceId: "f1" },
    ])

    expect(tx.execute).toHaveBeenCalledTimes(1)
    expect(lockedKeysOf(tx)).toEqual([
      "tpl-res:flow:f1",
      "tpl-res:flow:f2",
      "tpl-res:trigger:t1",
    ])
  })

  test("a repeat call for keys already held takes nothing", async () => {
    const tx = makeTx()
    await acquireTemplateResourceLocks(tx as never, [
      { kind: "flow", resourceId: "f1" },
      { kind: "reflink", resourceId: "r1" },
    ])
    await acquireTemplateResourceLocks(tx as never, [
      { kind: "flow", resourceId: "f1" },
    ])

    expect(tx.execute).toHaveBeenCalledTimes(1)
  })

  test("a savepoint over the same session sees the root transaction's locks", async () => {
    const session = {}
    const root = { ...makeTx(), session }
    const savepoint = { ...makeTx(), session }
    await acquireTemplateResourceLocks(root as never, [
      { kind: "flow", resourceId: "f1" },
    ])

    // Held by the root: a repeat from the nested handle is a no-op ...
    await acquireTemplateResourceLocks(savepoint as never, [
      { kind: "flow", resourceId: "f1" },
    ])
    expect(savepoint.execute).not.toHaveBeenCalled()
    // ... and a key the root does not hold reports a grown set, not a late lock.
    await expect(
      acquireTemplateResourceLocks(savepoint as never, [
        { kind: "reflink", resourceId: "r1" },
      ]),
    ).rejects.toBeInstanceOf(TemplateLockSetGrownError)
    expect(savepoint.execute).not.toHaveBeenCalled()
  })

  test("a later key is never taken late: the caller is told the set grew", async () => {
    const tx = makeTx()
    await acquireTemplateResourceLocks(tx as never, [
      { kind: "reflink", resourceId: "r1" },
    ])

    const attempt = acquireTemplateResourceLocks(tx as never, [
      { kind: "flow", resourceId: "f1" },
    ])

    await expect(attempt).rejects.toBeInstanceOf(TemplateLockSetGrownError)
    await expect(attempt).rejects.toMatchObject({
      keys: [
        { kind: "flow", resourceId: "f1", mode: "exclusive" },
        { kind: "reflink", resourceId: "r1", mode: "exclusive" },
      ],
    })
    // Only the first call locked anything.
    expect(tx.execute).toHaveBeenCalledTimes(1)
  })
})

describe("lock modes", () => {
  test("one statement takes each key in its own mode, in sorted order", async () => {
    const tx = makeTx()
    await acquireTemplateResourceLockRequests(tx as never, [
      { kind: "trigger", resourceId: "t1", mode: "exclusive" },
      { kind: "flow", resourceId: "f1", mode: "shared" },
    ])

    expect(tx.execute).toHaveBeenCalledTimes(1)
    expect(lockedKeysOf(tx)).toEqual(["tpl-res:flow:f1", "tpl-res:trigger:t1"])
    expect(sharedFlagsOf(tx)).toEqual([true, false])
  })

  test("a key asked for in both modes is taken exclusive", async () => {
    const tx = makeTx()
    await acquireTemplateResourceLockRequests(tx as never, [
      { kind: "flow", resourceId: "f1", mode: "shared" },
      { kind: "flow", resourceId: "f1", mode: "exclusive" },
    ])

    expect(lockedKeysOf(tx)).toEqual(["tpl-res:flow:f1"])
    expect(sharedFlagsOf(tx)).toEqual([false])
  })

  test("a held lock covers a repeat in the same or a weaker mode", async () => {
    const tx = makeTx()
    await acquireTemplateResourceLocks(tx as never, [
      { kind: "flow", resourceId: "f1" },
    ])
    await acquireTemplateResourceLocks(
      tx as never,
      [{ kind: "flow", resourceId: "f1" }],
      "shared",
    )

    const shared = makeTx()
    await acquireTemplateResourceLocks(
      shared as never,
      [{ kind: "flow", resourceId: "f1" }],
      "shared",
    )
    await acquireTemplateResourceLocks(
      shared as never,
      [{ kind: "flow", resourceId: "f1" }],
      "shared",
    )

    expect(tx.execute).toHaveBeenCalledTimes(1)
    expect(shared.execute).toHaveBeenCalledTimes(1)
  })

  test("a shared lock is never raised in place: the caller is told the set grew", async () => {
    const tx = makeTx()
    await acquireTemplateResourceLocks(
      tx as never,
      [{ kind: "flow", resourceId: "f1" }],
      "shared",
    )

    const attempt = acquireTemplateResourceLocks(tx as never, [
      { kind: "flow", resourceId: "f1" },
    ])

    await expect(attempt).rejects.toMatchObject({
      keys: [{ kind: "flow", resourceId: "f1", mode: "exclusive" }],
    })
    expect(tx.execute).toHaveBeenCalledTimes(1)
  })
})

describe("withTemplateLockedTransaction narrowing to installed resources", () => {
  const makeDatabase = (liveIds: string[]) => ({
    database: {
      transaction: async (run: (tx: never) => Promise<unknown>) =>
        await run({
          ...makeTx(),
          query: {
            templateInstalledResourceModel: {
              findMany: async () =>
                liveIds.map((resourceId) => ({
                  resourceKind: "flow",
                  resourceId,
                })),
            },
          },
        } as never),
    } as never,
  })

  test("a plain workspace takes no lock for the keys it names", async () => {
    const { database } = makeDatabase([])
    let locked: string[] = []

    await withTemplateLockedTransaction(
      async (tx) => {
        locked = lockedKeysOf(tx as never)
        await Promise.resolve()
      },
      {
        database,
        workspaceId: "ws-1",
        initialKeys: [{ kind: "flow", resourceId: "f1" }],
      },
    )

    expect(locked).toEqual([])
  })

  test("only the installed keys are locked", async () => {
    const { database } = makeDatabase(["f2"])
    let locked: string[] = []

    await withTemplateLockedTransaction(
      async (tx) => {
        locked = lockedKeysOf(tx as never)
        await Promise.resolve()
      },
      {
        database,
        workspaceId: "ws-1",
        initialKeys: [
          { kind: "flow", resourceId: "f1" },
          { kind: "flow", resourceId: "f2" },
        ],
      },
    )

    expect(locked).toEqual(["tpl-res:flow:f2"])
  })
})

describe("withTemplateLockedTransaction", () => {
  const makeDatabase = () => {
    const transactions: ReturnType<typeof makeTx>[] = []
    return {
      transactions,
      database: {
        transaction: async (run: (tx: never) => Promise<unknown>) => {
          const tx = makeTx()
          transactions.push(tx)
          return await run(tx as never)
        },
      } as never,
    }
  }

  test("prepare runs before any resource lock, on every attempt", async () => {
    const { database, transactions } = makeDatabase()
    const order: string[] = []

    await withTemplateLockedTransaction(
      async () => {
        await Promise.resolve()
        order.push("body")
      },
      {
        database,
        initialKeys: [{ kind: "flow", resourceId: "f1" }],
        prepare: async (tx) => {
          await Promise.resolve()
          order.push(
            `prepare:${(tx as never as { execute: { mock: { calls: unknown[] } } }).execute.mock.calls.length}`,
          )
        },
      },
    )

    expect(order).toEqual(["prepare:0", "body"])
    expect(transactions).toHaveLength(1)
  })

  test("the retry after a shared lock had to be raised takes the key exclusive up front", async () => {
    const { database, transactions } = makeDatabase()

    await withTemplateLockedTransaction(
      async (tx) => {
        await acquireTemplateResourceLocks(
          tx,
          [{ kind: "flow", resourceId: "f1" }],
          "shared",
        )
        await acquireTemplateResourceLocks(tx, [
          { kind: "flow", resourceId: "f1" },
        ])
      },
      { database },
    )

    expect(transactions).toHaveLength(2)
    expect(sharedFlagsOf(transactions[1])).toEqual([false])
  })

  test("retries with the grown set acquired up front, then succeeds", async () => {
    const { database, transactions } = makeDatabase()
    let attempts = 0

    const result = await withTemplateLockedTransaction(
      async (tx) => {
        attempts++
        // First attempt discovers a parent it did not lock.
        await acquireTemplateResourceLocks(tx, [
          { kind: "reflink", resourceId: "r1" },
        ])
        await acquireTemplateResourceLocks(tx, [
          { kind: "flow", resourceId: "f1" },
        ])
        return "done"
      },
      { database },
    )

    expect(result).toBe("done")
    expect(attempts).toBe(2)
    // The retry took the whole union, sorted, in one pass.
    expect(lockedKeysOf(transactions[1])).toEqual([
      "tpl-res:flow:f1",
      "tpl-res:reflink:r1",
    ])
  })

  test("gives up after three attempts with a transient conflict", async () => {
    const { database } = makeDatabase()
    let attempts = 0

    await expect(
      withTemplateLockedTransaction(
        async () => {
          await Promise.resolve()
          attempts++
          // The set keeps growing: a new key every time.
          throw new TemplateLockSetGrownError([
            { kind: "flow", resourceId: `f${attempts}`, mode: "exclusive" },
          ])
        },
        { database },
      ),
    ).rejects.toMatchObject({ code: "templateLockContention" })
    expect(attempts).toBe(3)
  })

  test("any other error is not retried", async () => {
    const { database } = makeDatabase()
    let attempts = 0

    await expect(
      withTemplateLockedTransaction(
        async () => {
          await Promise.resolve()
          attempts++
          throw new Error("boom")
        },
        { database },
      ),
    ).rejects.toThrow("boom")
    expect(attempts).toBe(1)
  })
})
