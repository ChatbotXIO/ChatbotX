import type { DatabaseClient } from "@chatbotx.io/database/client"
import { drizzle } from "drizzle-orm/node-postgres"
import { describe, expect, test } from "vitest"
import { MacRepository } from "../src/repositories/postgres/mac.repository"

const BIGINT_CAST = /\$\d+::bigint/
const TIMESTAMPTZ_CAST = /\$\d+::timestamptz/

type QueryWithSql = {
  toSQL: () => { sql: string }
}

function captureQuery(client: DatabaseClient): {
  client: DatabaseClient
  queries: string[]
} {
  const queries: string[] = []
  const wrap = (builder: object): unknown =>
    new Proxy(builder, {
      get(target, property) {
        if (property === "then") {
          const { sql } = (target as QueryWithSql).toSQL()
          queries.push(sql)
          return (resolve: (value: unknown) => void) => resolve([])
        }

        const value = Reflect.get(target, property)
        return typeof value === "function"
          ? (...args: unknown[]) => wrap(value.apply(target, args))
          : value
      },
    })

  return {
    client: {
      insert: (table: never) => wrap(client.insert(table)),
      select: (fields?: never) => wrap(client.select(fields)),
    } as unknown as DatabaseClient,
    queries,
  }
}

describe("MacRepository — ensureWorkspaceMac SQL", () => {
  test("selects every WorkspaceMac column in table order", async () => {
    const { client, queries } = captureQuery(drizzle.mock() as DatabaseClient)
    const repository = new MacRepository()

    await expect(
      repository.ensureWorkspaceMac(
        [
          {
            workspaceId: "ws-1",
            periodStart: new Date("2026-04-10T09:00:00.000Z"),
            periodEnd: new Date("2026-05-10T09:00:00.000Z"),
          },
        ],
        client,
      ),
    ).resolves.toEqual(new Map())

    const [sql] = queries
    expect(sql).toContain(
      'insert into "WorkspaceMac" ("id", "createdAt", "updatedAt", "workspaceId", "ownerId", "tenantId", "periodStart", "periodEnd", "macCount") select',
    )
    expect(sql).toMatch(BIGINT_CAST)
    expect(sql).toMatch(TIMESTAMPTZ_CAST)
  })
})
