// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

const state = vi.hoisted(() => ({
  rows: [] as { id: string; workspaceId: string; name: string; type: string }[],
  tail: Promise.resolve() as Promise<unknown>,
  nextId: 100,
}))

/**
 * The workspace name lock modelled as a mutex around `db.transaction`: two
 * installs into one workspace run one after the other, the second seeing the
 * first's committed rows (which is what `pg_advisory_xact_lock` guarantees).
 */
const mockDb = vi.hoisted(() => {
  const db: Record<string, unknown> = {}
  Object.assign(db, {
    query: {
      customFieldModel: {
        findMany: () => Promise.resolve(state.rows.map((row) => ({ ...row }))),
      },
    },
    insert: () => ({
      values: (
        values: { name: string; type: string; workspaceId: string }[],
      ) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            const created = values.map((value) => ({
              ...value,
              id: String(state.nextId++),
            }))
            state.rows.push(...created)
            return Promise.resolve(created)
          },
        }),
      }),
    }),
    execute: () => Promise.resolve(),
    transaction: (callback: (tx: unknown) => Promise<unknown>) => {
      const run = state.tail.then(() => callback(db))
      state.tail = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },
  })
  return db
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: mockDb,
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  relationsFilterToSQL: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/partials", () => ({ rootFolderId: "root" }))
vi.mock("@chatbotx.io/database/schema", () => ({
  customFieldModel: { table: "CustomField" },
}))
vi.mock("@chatbotx.io/database/utils", () => ({
  likeContains: vi.fn(),
  parseOrderByAsObject: vi.fn(),
  parsePagination: vi.fn(),
}))
vi.mock("@chatbotx.io/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: () => `generated-${state.nextId++}`,
}))
vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    invalidateCacheTags() {
      return Promise.resolve()
    }
  },
}))
vi.mock("../src/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/errors")>()),
  notFoundException: (message: string) => new Error(message),
}))
vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: vi.fn() },
}))

const { customFieldService } = await import("../src/custom-field/service")

describe("concurrent installs into one workspace", () => {
  test("each gets its own suffix, never the same renamed field twice", async () => {
    state.rows = [
      { id: "1", workspaceId: "ws-1", name: "foo", type: "shortText" },
    ]
    const request = () =>
      customFieldService.resolveByNameAndType({
        workspaceId: "ws-1",
        fields: [{ name: "foo", type: "number" }],
      })

    const [first, second, third] = await Promise.all([
      request(),
      request(),
      request(),
    ])

    const names = [first, second, third].map(
      (result) => [...result.resolved.values()][0].name,
    )
    expect(new Set(names).size).toBe(3)
    expect(names).toEqual(["foo_1", "foo_2", "foo_3"])
    // And the ids are distinct rows too.
    expect(
      new Set([first, second, third].map((r) => [...r.idMap.values()][0])).size,
    ).toBe(3)
  })
})
