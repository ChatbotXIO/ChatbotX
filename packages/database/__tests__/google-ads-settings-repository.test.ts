import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import type { GoogleAdsSettingsDocument } from "../src/partials/google-ads"
import { googleAdsSettingsRepository } from "../src/repositories/google-ads-settings/repository"
import { googleAdsSettingsModel } from "../src/schema"

const dialect = new PgDialect()

const SETTINGS: GoogleAdsSettingsDocument = {
  version: 1,
  consent: {
    adUserData: { type: "granted" },
    adPersonalization: { type: "notProvided" },
  },
}

const buildSelectTx = (rows: unknown[]) => {
  let whereSql = ""
  let whereParams: unknown[] = []
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn((condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const query = dialect.sqlToQuery(condition)
    whereSql = query.sql
    whereParams = query.params
    return { limit }
  })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  return {
    tx: { select } as unknown as DatabaseClient,
    from,
    getWhere: () => ({ sql: whereSql, params: whereParams }),
    limit,
  }
}

const buildUpsertTx = (returned: unknown[]) => {
  const returning = vi.fn().mockResolvedValue(returned)
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning })
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
  const insert = vi.fn().mockReturnValue({ values })
  return {
    tx: { insert } as unknown as DatabaseClient,
    insert,
    values,
    onConflictDoUpdate,
  }
}

describe("googleAdsSettingsRepository.findByWorkspaceId", () => {
  test("reads only the requested workspace's row", async () => {
    const row = { id: "s-1", workspaceId: "ws-A", settings: SETTINGS }
    const { tx, from, getWhere, limit } = buildSelectTx([row])

    const result = await googleAdsSettingsRepository.findByWorkspaceId(
      "ws-A",
      tx,
    )

    expect(result).toBe(row)
    expect(from).toHaveBeenCalledWith(googleAdsSettingsModel)
    expect(getWhere().sql).toContain('"workspaceId" = $')
    expect(getWhere().params).toEqual(["ws-A"])
    expect(limit).toHaveBeenCalledWith(1)
  })

  test("returns null when the workspace has no row", async () => {
    const { tx } = buildSelectTx([])

    expect(
      await googleAdsSettingsRepository.findByWorkspaceId("ws-B", tx),
    ).toBeNull()
  })
})

describe("googleAdsSettingsRepository.upsertSettings", () => {
  test("inserts the document and replaces only it on workspace conflict", async () => {
    const row = { id: "s-1", workspaceId: "ws-A", settings: SETTINGS }
    const { tx, insert, values, onConflictDoUpdate } = buildUpsertTx([row])

    const result = await googleAdsSettingsRepository.upsertSettings(
      { workspaceId: "ws-A", settings: SETTINGS },
      tx,
    )

    expect(result).toBe(row)
    expect(insert).toHaveBeenCalledWith(googleAdsSettingsModel)
    expect(values).toHaveBeenCalledWith({
      workspaceId: "ws-A",
      settings: SETTINGS,
    })
    const conflict = onConflictDoUpdate.mock.calls[0]?.[0]
    expect(conflict.target).toBe(googleAdsSettingsModel.workspaceId)
    // The conflict target is the workspace and the update never rewrites it,
    // so workspace A's save can never touch workspace B's row.
    expect(Object.keys(conflict.set).sort()).toEqual(["settings"])
    expect(conflict.set.settings).toBe(SETTINGS)
  })

  test("throws when the statement returns no row", async () => {
    const { tx } = buildUpsertTx([])

    await expect(
      googleAdsSettingsRepository.upsertSettings(
        { workspaceId: "ws-A", settings: SETTINGS },
        tx,
      ),
    ).rejects.toThrow("Failed to upsert Google Ads settings")
  })
})
