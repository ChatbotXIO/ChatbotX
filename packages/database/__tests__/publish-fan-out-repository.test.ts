import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { publishFanOutRepository } from "../src/repositories/publish-destination/fan-out"

const dialect = new PgDialect()

/** A client whose select chains record each `where` clause as rendered SQL. */
const recordingClient = () => {
  const wheres: { params: unknown[]; sql: string }[] = []
  let inserts = 0
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    limit: async () => [],
    orderBy: () => chain,
    where: (clause: SQL) => {
      const { params, sql } = dialect.sqlToQuery(clause)
      wheres.push({ params, sql })
      return chain
    },
  }
  const tx = {
    insert: () => {
      inserts += 1
      return {}
    },
    select: () => chain,
  } as unknown as DatabaseClient
  return { inserts: () => inserts, tx, wheres }
}

const query = {
  clientId: "app-1",
  facebookUserId: "fb-1",
  kinds: ["messenger", "instagramFacebook"] as (
    | "messenger"
    | "instagramFacebook"
  )[],
  limit: 10,
  pageIds: ["p1", "p2"],
  workspaceId: "w1",
}

describe("publishFanOutRepository.findCandidates guards", () => {
  test("every table is filtered by workspace, connected inbox, app client id and stored authorizer", async () => {
    const { tx, wheres } = recordingClient()

    await publishFanOutRepository.findCandidates(
      { ...query, excludeIntegrationId: "selected" },
      tx,
    )

    expect(wheres).toHaveLength(2)
    for (const where of wheres) {
      expect(where.sql).toContain('"workspaceId" = $')
      expect(where.sql).toContain('"pageId" in')
      expect(where.sql).toContain('"id" <> $')
      expect(where.sql).toContain('"status" = $')
      expect(where.sql).toContain("->> 'clientId'")
      expect(where.sql).toContain("->> 'userId'")
      expect(where.params).toEqual(
        expect.arrayContaining([
          "w1",
          "p1",
          "p2",
          "selected",
          "connected",
          "app-1",
          "fb-1",
        ]),
      )
    }
    expect(wheres[1]?.params).toContain("facebook")
  })

  test("only the requested kinds are read and nothing is ever inserted", async () => {
    const { inserts, tx, wheres } = recordingClient()

    await publishFanOutRepository.findCandidates(
      { ...query, kinds: ["messenger"] },
      tx,
    )

    expect(wheres).toHaveLength(1)
    expect(inserts()).toBe(0)
  })

  test("no pages means no query", async () => {
    const select = vi.fn()
    const tx = { select } as unknown as DatabaseClient

    const rows = await publishFanOutRepository.findCandidates(
      { ...query, pageIds: [] },
      tx,
    )

    expect(rows).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })
})
