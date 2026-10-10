import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import { connectSessionRepository } from "../src/repositories/connect-session/repository"
import { integrationGoogleAdsRepository } from "../src/repositories/integration-google-ads/repository"

const dialect = new PgDialect()
type Condition = Parameters<PgDialect["sqlToQuery"]>[0]

describe("integrationGoogleAdsRepository", () => {
  test("findByWorkspaceId scopes by workspace", async () => {
    const wheres: string[] = []
    const limit = vi.fn().mockResolvedValue([{ id: "1" }])
    const where = vi.fn((condition: Condition) => {
      wheres.push(dialect.sqlToQuery(condition).sql)
      return { limit }
    })
    const tx = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
    } as never

    await integrationGoogleAdsRepository.findByWorkspaceId(
      { workspaceId: "ws" },
      tx,
    )

    expect(wheres[0]).toContain('"workspaceId" = $')
  })

  test("updateSetup is workspace-scoped and writes only the given values", async () => {
    let setValues: unknown
    let whereSql = ""
    const returning = vi.fn().mockResolvedValue([{ id: "1" }])
    const where = vi.fn((condition: Condition) => {
      whereSql = dialect.sqlToQuery(condition).sql
      return { returning }
    })
    const set = vi.fn((values: unknown) => {
      setValues = values
      return { where }
    })
    const tx = { update: vi.fn(() => ({ set })) } as never

    await integrationGoogleAdsRepository.updateSetup(
      {
        id: "1",
        workspaceId: "ws",
        values: { conversionCustomerId: "123", setupError: null },
      },
      tx,
    )

    expect(setValues).toEqual({ conversionCustomerId: "123", setupError: null })
    expect(whereSql).toContain('"workspaceId" = $')
  })

  describe("listSyncTargets", () => {
    const build = (rows: unknown[]) => {
      const captured = {
        whereSql: undefined as string | undefined,
        orderSql: "",
      }
      const limit = vi.fn().mockResolvedValue(rows)
      const orderBy = vi.fn((order: Condition) => {
        captured.orderSql = dialect.sqlToQuery(order).sql
        return { limit }
      })
      const where = vi.fn((condition: Condition | undefined) => {
        captured.whereSql = condition
          ? dialect.sqlToQuery(condition).sql
          : undefined
        return { orderBy }
      })
      const select = vi.fn(() => ({ from: vi.fn(() => ({ where })) }))
      return { tx: { select } as never, captured, limit, select, where }
    }

    test("first page has no id filter, orders by id asc and applies the limit", async () => {
      const rows = [{ id: "1", workspaceId: "ws" }]
      const { tx, captured, limit, select } = build(rows)

      await expect(
        integrationGoogleAdsRepository.listSyncTargets({ limit: 100 }, tx),
      ).resolves.toBe(rows)

      expect(captured.whereSql).toBeUndefined()
      expect(captured.orderSql).toContain('"id"')
      expect(captured.orderSql).not.toContain("desc")
      expect(limit).toHaveBeenCalledWith(100)
      expect(select).toHaveBeenCalledWith({
        id: expect.anything(),
        workspaceId: expect.anything(),
      })
    })

    test("afterId is a strict keyset lower bound", async () => {
      const { tx, captured, limit } = build([])

      await integrationGoogleAdsRepository.listSyncTargets(
        { afterId: "abc", limit: 5 },
        tx,
      )

      expect(captured.whereSql).toContain('"id" > $')
      expect(limit).toHaveBeenCalledWith(5)
    })
  })

  test("listConnectedCustomerIds returns distinct customer ids", async () => {
    const tx = {
      selectDistinct: vi.fn(() => ({
        from: vi
          .fn()
          .mockResolvedValue([{ customerId: "1" }, { customerId: "2" }]),
      })),
    } as never

    await expect(
      integrationGoogleAdsRepository.listConnectedCustomerIds(tx),
    ).resolves.toEqual(["1", "2"])
  })
})

describe("connectSessionRepository.findLatestInFlightByProvider", () => {
  test("filters workspace, provider, active statuses and expiry, newest first", async () => {
    let whereSql = ""
    let orderSql = ""
    const limit = vi.fn().mockResolvedValue([])
    const orderBy = vi.fn((order: Condition) => {
      orderSql = dialect.sqlToQuery(order).sql
      return { limit }
    })
    const where = vi.fn((condition: Condition) => {
      whereSql = dialect.sqlToQuery(condition).sql
      return { orderBy }
    })
    const tx = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
    } as never

    const session = await connectSessionRepository.findLatestInFlightByProvider(
      { workspaceId: "ws", provider: "googleAds" },
      tx,
    )

    expect(session).toBeUndefined()
    expect(whereSql).toContain('"workspaceId" = $')
    expect(whereSql).toContain('"provider" = $')
    expect(whereSql).toContain('"status" in ($')
    expect(whereSql).toContain('"expiresAt" > now()')
    expect(orderSql).toContain("desc")
  })
})
