import { describe, expect, test, vi } from "vitest"
import { db } from "../src/client"
import { flowRepository } from "../src/repositories/flow/repository"

// drizzle-orm 1.0.0-rc throws "Unexpected 'undefined' in filter value" for an
// `undefined` in a relational `where`; the client strips them so optional
// filters keep beta semantics (Flows menu crashed in production without it).
describe("relational queries with undefined filter values", () => {
  test("findMany drops undefined top-level and nested where keys", () => {
    const query = db.query.flowModel.findMany({
      where: { workspaceId: "w1", name: undefined, active: undefined },
      with: {
        flowVersions: {
          where: { OR: [{ isDraft: true }, { isLatest: undefined }] },
        },
      },
    })

    const { sql, params } = query.toSQL()
    const outerWhere = sql.slice(sql.lastIndexOf(" where "))
    expect(outerWhere).toContain('"d0"."workspaceId" = $')
    expect(outerWhere).not.toContain('"name"')
    expect(params).toEqual([true, "w1"])
  })

  test("findFirst drops undefined where keys", () => {
    const query = db.query.flowModel.findFirst({
      where: { id: "f1", folderId: undefined },
    })

    expect(() => query.toSQL()).not.toThrow()
  })

  test("transactions share the patched builder", () => {
    const txQuery = Object.getPrototypeOf(db.query.flowModel)
    expect(txQuery.findMany).toBe(
      Object.getPrototypeOf(db.query.flowVersionModel).findMany,
    )
  })

  test("flow list without optional filters builds SQL", async () => {
    const builder = db.query.flowModel
    const original = Object.getPrototypeOf(builder).findMany
    let built: { toSQL: () => unknown } | undefined
    const spy = vi.spyOn(builder, "findMany").mockImplementation(function (
      this: unknown,
      config?: unknown,
    ) {
      built = original.call(this, config)
      return Promise.resolve([]) as never
    })

    await flowRepository.listWithVersions({
      workspaceId: "w1",
      name: null,
      folderId: null,
      active: null,
    })

    expect(() => built?.toSQL()).not.toThrow()
    spy.mockRestore()
  })
})
