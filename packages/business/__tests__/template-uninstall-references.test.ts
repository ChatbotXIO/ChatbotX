// @vitest-environment node

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"

const {
  COLUMN_SLOTS,
  JSON_CONTAINERS,
  findParentsWithOutsideDependents,
  withInboundEdgeCache,
} = await import("../src/template/uninstall-references")

const NON_NUMERIC = /Non-numeric id/
const dialect = new PgDialect()
const textOf = (query: unknown): string =>
  dialect.sqlToQuery(query as never).sql

type Responder = (sqlText: string) => Record<string, unknown>[]

const fakeTx = (respond: Responder = () => []) => {
  const statements: string[] = []
  const tx = {
    execute: (query: unknown) => {
      const text = textOf(query)
      statements.push(text)
      return Promise.resolve({ rows: respond(text) })
    },
  }
  return { tx: tx as unknown as DatabaseClient, statements }
}

const scope = { workspaceId: "1" }

describe("inbound reference probes", () => {
  test("issues the same number of statements for 1 id and for 200 ids", async () => {
    const few = fakeTx()
    await findParentsWithOutsideDependents(
      few.tx,
      "flow",
      ["1"],
      new Set(),
      scope,
    )
    const many = fakeTx()
    const ids = Array.from({ length: 200 }, (_, index) => String(index + 1))
    await findParentsWithOutsideDependents(
      many.tx,
      "flow",
      ids,
      new Set(),
      scope,
    )

    expect(many.statements.length).toBe(few.statements.length)
    // One per column slot plus at most one per JSON container, never one per id.
    const slots = COLUMN_SLOTS.filter((slot) => slot.parent === "flow").length
    expect(many.statements.length).toBeLessThanOrEqual(
      slots + JSON_CONTAINERS.length,
    )
  })

  test("conditions are scoped through indexed trigger and webhook id lists, not a per-row EXISTS", async () => {
    const { tx, statements } = fakeTx()
    await findParentsWithOutsideDependents(
      tx,
      "flow",
      ["1", "2"],
      new Set(),
      scope,
    )
    const conditionStatements = statements.filter((text) =>
      text.includes('"Condition"'),
    )
    expect(conditionStatements.length).toBeGreaterThan(0)
    for (const text of conditionStatements) {
      expect(text).toContain('"triggerId" IN (SELECT')
      expect(text).toContain('"webhookId" IN (SELECT')
      expect(text).not.toContain('EXISTS (SELECT 1 FROM "Trigger"')
    }
  })

  test("all ids of a container go into one regex, not one probe per id", async () => {
    const { tx, statements } = fakeTx()
    await findParentsWithOutsideDependents(
      tx,
      "flow",
      ["11", "2", "345"],
      new Set(),
      scope,
    )
    const flowVersion = statements.filter((text) =>
      text.includes('"FlowVersion"'),
    )
    expect(flowVersion).toHaveLength(1)
  })

  test("a non-numeric id is rejected before it can reach a regex", async () => {
    const { tx } = fakeTx()
    await expect(
      findParentsWithOutsideDependents(tx, "flow", ["1|.*"], new Set(), scope),
    ).rejects.toThrow(NON_NUMERIC)
  })

  test("a holder inside the deleting set is ignored; installer data and outside holders protect", async () => {
    const reflinkOnly: Responder = (text) =>
      text.includes('"Reflink"') ? [{ parent: "1", holder_id: "9" }] : []

    const inside = fakeTx(reflinkOnly)
    expect(
      await findParentsWithOutsideDependents(
        inside.tx,
        "flow",
        ["1"],
        new Set(["reflink:9"]),
        scope,
      ),
    ).toEqual(new Set())

    const outside = fakeTx(reflinkOnly)
    expect(
      await findParentsWithOutsideDependents(
        outside.tx,
        "flow",
        ["1"],
        new Set(),
        scope,
      ),
    ).toEqual(new Set(["1"]))

    const installerData = fakeTx((text) =>
      text.includes('"Broadcast"') && text.includes('"flowId"')
        ? [{ parent: "1", holder_id: null }]
        : [],
    )
    expect(
      await findParentsWithOutsideDependents(
        installerData.tx,
        "flow",
        ["1"],
        new Set(["reflink:9"]),
        scope,
      ),
    ).toEqual(new Set(["1"]))
  })

  test("a closure reads the references once, however many passes re-test them", async () => {
    const reflink: Responder = (text) =>
      text.includes('"Reflink"') ? [{ parent: "1", holder_id: "9" }] : []
    const cached = fakeTx(reflink)
    await withInboundEdgeCache(cached.tx, async () => {
      await findParentsWithOutsideDependents(
        cached.tx,
        "flow",
        ["1", "2", "3"],
        new Set(["reflink:9"]),
        scope,
      )
      // The shrinking second and third pass re-ask for a subset of the ids.
      await findParentsWithOutsideDependents(
        cached.tx,
        "flow",
        ["1", "2"],
        new Set(),
        scope,
      )
      return await findParentsWithOutsideDependents(
        cached.tx,
        "flow",
        ["2"],
        new Set(),
        scope,
      )
    })
    const uncached = fakeTx(reflink)
    await findParentsWithOutsideDependents(
      uncached.tx,
      "flow",
      ["1", "2", "3"],
      new Set(),
      scope,
    )
    await findParentsWithOutsideDependents(
      uncached.tx,
      "flow",
      ["1", "2"],
      new Set(),
      scope,
    )
    await findParentsWithOutsideDependents(
      uncached.tx,
      "flow",
      ["2"],
      new Set(),
      scope,
    )

    expect(cached.statements.length).toBe(uncached.statements.length / 3)
  })

  test("the cache ends with the closure: a later call reads fresh", async () => {
    const { tx, statements } = fakeTx()
    await withInboundEdgeCache(tx, () =>
      findParentsWithOutsideDependents(tx, "flow", ["1"], new Set(), scope),
    )
    const afterFirst = statements.length
    await findParentsWithOutsideDependents(tx, "flow", ["1"], new Set(), scope)
    expect(statements.length).toBe(afterFirst * 2)
  })
})
