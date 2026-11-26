import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { channelPostRepository } from "../src/repositories/channel-post/repository"

const dialect = new PgDialect()

const runSave = async (returned: { id: string }[]) => {
  const returning = vi.fn().mockResolvedValue(returned)
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  const tx = {
    update: vi.fn().mockReturnValue({ set }),
  } as unknown as DatabaseClient
  const written = await channelPostRepository.saveMetadata(
    {
      id: "7",
      metadata: {
        caption: null,
        mediaType: null,
        permalink: null,
        publishedAt: null,
        thumbnail: null,
      },
      workspaceId: "ws-1",
    },
    tx,
  )
  const condition = where.mock.calls[0]?.[0]
  return { sql: dialect.sqlToQuery(condition).sql, written }
}

describe("channelPostRepository.saveMetadata", () => {
  test("only writes a row the listing sync has not completed", async () => {
    const { sql } = await runSave([{ id: "7" }])

    expect(sql).toContain('"metadataFetchedAt" is null')
    expect(sql).toContain('"workspaceId"')
  })

  test("reports whether the row was written", async () => {
    expect((await runSave([{ id: "7" }])).written).toBe(true)
    expect((await runSave([])).written).toBe(false)
  })
})
