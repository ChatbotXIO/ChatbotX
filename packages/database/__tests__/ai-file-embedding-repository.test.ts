import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import type { AIFileChunking } from "../src/partials"
import { AiFileEmbeddingRepository } from "../src/repositories/ai-file-embedding/repository"
import { aiFileModel } from "../src/schema"

const dialect = new PgDialect()
const PLACEHOLDER_REGEX = /\$\d+(::\w+)?/g
const TEXT_CAST_REGEX = /::text$/

const CHUNKING: AIFileChunking = {
  strategy: "tabular",
  chunkerVersion: 1,
  chunkSize: 1000,
  overlapSize: 0,
  chunkCount: 3,
  processedAt: "2026-10-24T00:00:00.000Z",
}

const buildUpdateClient = () => {
  let whereSql = ""
  let whereParams: unknown[] = []
  const where = vi.fn((condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const query = dialect.sqlToQuery(condition)
    whereSql = query.sql
    whereParams = query.params
    return Promise.resolve()
  })
  const set = vi.fn().mockReturnValue({ where })
  const update = vi.fn().mockReturnValue({ set })
  return {
    client: { update } as unknown as DatabaseClient,
    update,
    set,
    getWhere: () => ({ sql: whereSql, params: whereParams }),
  }
}

describe("AiFileEmbeddingRepository.markChunked", () => {
  test("writes only the chunking column of the file in its own workspace", async () => {
    const { client, update, set, getWhere } = buildUpdateClient()

    await new AiFileEmbeddingRepository(client).markChunked({
      aiFileId: "file-1",
      workspaceId: "ws-A",
      chunking: CHUNKING,
    })

    expect(update).toHaveBeenCalledWith(aiFileModel)
    expect(set).toHaveBeenCalledWith({ chunking: CHUNKING })
    expect(getWhere().sql).toContain('"id" = $')
    expect(getWhere().sql).toContain('"workspaceId" = $')
    expect(getWhere().params).toEqual(["file-1", "ws-A"])
  })
})

describe("AiFileEmbeddingRepository query boundaries", () => {
  test("binds vectors and scopes vector search to the workspace and ready chunks", async () => {
    let captured: ReturnType<PgDialect["sqlToQuery"]> | undefined
    const execute = vi.fn((query) => {
      captured = dialect.sqlToQuery(query)
      return Promise.resolve({ rows: [] })
    })
    const repository = new AiFileEmbeddingRepository({
      execute,
    } as unknown as DatabaseClient)

    await repository.vectorSearch({
      workspaceId: "workspace-1",
      fileIds: ["10", "20"],
      queryVector: [0.1, 0.2],
      limit: 5,
    })

    expect(captured?.sql).toContain('"workspaceId" = $')
    expect(captured?.sql).toContain('"status" =')
    expect(captured?.sql).toContain('"embedding" IS NOT NULL')
    expect(captured?.params).toEqual(
      expect.arrayContaining(["workspace-1", "10", "20", "[0.1,0.2]", 5]),
    )
  })

  test("does not query when vector search has no file ids", async () => {
    const execute = vi.fn()
    const repository = new AiFileEmbeddingRepository({
      execute,
    } as unknown as DatabaseClient)

    await expect(
      repository.vectorSearch({
        workspaceId: "workspace-1",
        fileIds: [],
        queryVector: [0.1],
        limit: 5,
      }),
    ).resolves.toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })

  test("claims a processing run with a workspace-scoped stale lease condition", async () => {
    let captured: ReturnType<PgDialect["sqlToQuery"]> | undefined
    const execute = vi.fn((query) => {
      captured = dialect.sqlToQuery(query)
      return Promise.resolve({ rows: [{ id: "1" }] })
    })
    const repository = new AiFileEmbeddingRepository({
      execute,
    } as unknown as DatabaseClient)

    await expect(
      repository.claimProcessingRun({
        aiFileId: "1",
        workspaceId: "workspace-1",
        staleBeforeIso: "2026-10-24T00:00:00.000Z",
        run: {
          id: "run-1",
          status: "queued",
          error: null,
          queuedAt: "2026-10-24T01:00:00.000Z",
          startedAt: null,
          heartbeatAt: null,
          finishedAt: null,
        },
      }),
    ).resolves.toBe(true)

    expect(captured?.sql).toContain("COALESCE")
    expect(captured?.sql).toContain("heartbeatAt")
    expect(captured?.sql).not.toContain("timestamptz")
    expect(captured?.params).toEqual(
      expect.arrayContaining(["1", "workspace-1"]),
    )
  })

  const captureExecute = (rows: unknown[] = [{ id: "1" }]) => {
    const queries: ReturnType<PgDialect["sqlToQuery"]>[] = []
    const execute = vi.fn((query) => {
      queries.push(dialect.sqlToQuery(query))
      return Promise.resolve({ rows })
    })
    return {
      repository: new AiFileEmbeddingRepository({
        execute,
      } as unknown as DatabaseClient),
      queries,
    }
  }

  const ids = { aiFileId: "1", workspaceId: "workspace-1", runId: "run-1" }

  test("start, lease and finish guard on run id, workspace and status, and merge with ||", async () => {
    const { repository, queries } = captureExecute()

    await repository.markProcessingRunStarted({
      ...ids,
      now: "2026-10-24T00:00:00.000Z",
    })
    await repository.refreshProcessingRunLease({
      ...ids,
      heartbeatAt: "2026-10-24T00:01:00.000Z",
    })
    await repository.finishProcessingRun({
      ...ids,
      status: "error",
      error: "unknown",
      finishedAt: "2026-10-24T00:02:00.000Z",
    })

    for (const query of queries) {
      expect(query.sql).toContain(`"processingRun" || jsonb_build_object(`)
      expect(query.sql).toContain(`"processingRun"->>'id' = $`)
      expect(query.sql).toContain(`"workspaceId" = $`)
      expect(query.sql).toContain(`"processingRun"->>'status' IN (`)
      expect(query.params).toEqual(
        expect.arrayContaining(["1", "workspace-1", "run-1"]),
      )
      // jsonb_build_object takes "any": an untyped bind fails on Postgres.
      const builtArgs = query.sql.slice(
        query.sql.indexOf("jsonb_build_object("),
        query.sql.indexOf("WHERE"),
      )
      for (const placeholder of builtArgs.match(PLACEHOLDER_REGEX) ?? []) {
        expect(placeholder).toMatch(TEXT_CAST_REGEX)
      }
    }
    expect(queries[0]?.sql).toContain(`COALESCE("processingRun"->>'startedAt'`)
    expect(queries[0]?.params).toEqual(
      expect.arrayContaining(["queued", "processing"]),
    )
    expect(queries[1]?.params).not.toContain("queued")
    expect(queries[2]?.params).toEqual(
      expect.arrayContaining(["error", "unknown", "2026-10-24T00:02:00.000Z"]),
    )
  })

  test("reports whether a run row was updated", async () => {
    const { repository } = captureExecute([])

    await expect(
      repository.refreshProcessingRunLease({
        ...ids,
        heartbeatAt: "2026-10-24T00:00:00.000Z",
      }),
    ).resolves.toBe(false)
  })

  const buildSelectClient = () => {
    const captured: {
      where?: ReturnType<PgDialect["sqlToQuery"]>
      orderBy: ReturnType<PgDialect["sqlToQuery"]>[]
      limit?: number
    } = { orderBy: [] }
    const chain = {
      from: () => chain,
      where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        captured.where = dialect.sqlToQuery(condition)
        return chain
      },
      orderBy: (...orderings: Parameters<PgDialect["sqlToQuery"]>[0][]) => {
        captured.orderBy = orderings.map((ordering) =>
          dialect.sqlToQuery(ordering),
        )
        return chain
      },
      limit: (limit: number) => {
        captured.limit = limit
        return Promise.resolve([])
      },
    }
    return {
      captured,
      repository: new AiFileEmbeddingRepository({
        select: () => chain,
      } as unknown as DatabaseClient),
    }
  }

  test("lists chunks in document order, scoped to the file and workspace", async () => {
    const { captured, repository } = buildSelectClient()

    await repository.listChunks({
      workspaceId: "workspace-1",
      aiFileId: "1",
      limit: 50,
    })

    expect(captured.where?.params).toEqual(["workspace-1", "1"])
    expect(captured.orderBy[0]?.sql).toContain("ASC NULLS LAST")
    expect(captured.orderBy[0]?.sql).toContain('"chunkIndex"')
    expect(captured.limit).toBe(51)
  })

  test("continues after a numbered row with a keyset over (chunkIndex, id)", async () => {
    const { captured, repository } = buildSelectClient()

    await repository.listChunks({
      workspaceId: "workspace-1",
      aiFileId: "1",
      limit: 50,
      cursor: { chunkIndex: 4, id: "100" },
    })

    expect(captured.where?.sql).toContain('"chunkIndex" >')
    expect(captured.where?.sql).toContain('"chunkIndex" =')
    expect(captured.where?.sql).toContain('"chunkIndex" is null')
    expect(captured.where?.params).toEqual(
      expect.arrayContaining(["workspace-1", "1", 4, "100"]),
    )
  })

  test("continues inside the unnumbered rows after a null position", async () => {
    const { captured, repository } = buildSelectClient()

    await repository.listChunks({
      workspaceId: "workspace-1",
      aiFileId: "1",
      limit: 50,
      cursor: { chunkIndex: null, id: "100" },
    })

    expect(captured.where?.sql).toContain('"chunkIndex" is null')
    expect(captured.where?.sql).not.toContain('"chunkIndex" >')
    expect(captured.where?.params).toEqual(["workspace-1", "1", "100"])
  })

  test("opens the first page at a position and keeps unnumbered rows reachable", async () => {
    const { captured, repository } = buildSelectClient()

    await repository.listChunks({
      workspaceId: "workspace-1",
      aiFileId: "1",
      limit: 50,
      fromChunkIndex: 12,
    })

    expect(captured.where?.sql).toContain('"chunkIndex" >=')
    expect(captured.where?.sql).toContain('"chunkIndex" is null')
    expect(captured.where?.params).toContain(12)
  })

  test("ignores fromChunkIndex when a cursor is present", async () => {
    const { captured, repository } = buildSelectClient()

    await repository.listChunks({
      workspaceId: "workspace-1",
      aiFileId: "1",
      limit: 50,
      cursor: { chunkIndex: 1, id: "5" },
      fromChunkIndex: 12,
    })

    expect(captured.where?.params).not.toContain(12)
  })

  test("finds chunks containing text with a bound, escaped ILIKE pattern", async () => {
    const { captured, repository } = buildSelectClient()

    await repository.findChunksContaining({
      workspaceId: "workspace-1",
      fileIds: ["1", "2"],
      pattern: "%50\\%%",
      limit: 20,
    })

    expect(captured.where?.sql).toContain("ILIKE")
    expect(captured.where?.sql).toContain("ESCAPE")
    expect(captured.where?.sql).toContain('"workspaceId" =')
    expect(captured.where?.params).toEqual(
      expect.arrayContaining(["workspace-1", "1", "2", "%50\\%%"]),
    )
    expect(captured.limit).toBe(20)
  })

  test("does not query for chunks containing text without files", async () => {
    const select = vi.fn()
    const repository = new AiFileEmbeddingRepository({
      select,
    } as unknown as DatabaseClient)

    await expect(
      repository.findChunksContaining({
        workspaceId: "workspace-1",
        fileIds: [],
        pattern: "%x%",
        limit: 20,
      }),
    ).resolves.toEqual([])
    expect(select).not.toHaveBeenCalled()
  })

  test.each([
    ["leaves the column alone", undefined, false, undefined],
    ["resets it to the defaults", null, true, undefined],
    ["replaces it", { chunkSize: 500 }, true, '{"chunkSize":500}'],
  ] as const)("claim %s when chunkingConfig is %j", async (_name, chunkingConfig, touchesColumn, jsonParam) => {
    const { repository, queries } = captureExecute()

    await repository.claimProcessingRun({
      aiFileId: "1",
      workspaceId: "workspace-1",
      staleBeforeIso: "2026-10-24T00:00:00.000Z",
      chunkingConfig,
      run: {
        id: "run-1",
        status: "queued",
        error: null,
        queuedAt: "2026-10-24T01:00:00.000Z",
        startedAt: null,
        heartbeatAt: null,
        finishedAt: null,
      },
    })

    expect(queries[0]?.sql.includes('"chunkingConfig"')).toBe(touchesColumn)
    if (jsonParam) {
      expect(queries[0]?.params).toContain(jsonParam)
    }
  })

  test("reconcile resets only kept error chunks to pending", async () => {
    const updates: Array<{
      set: unknown
      where: ReturnType<PgDialect["sqlToQuery"]>
    }> = []
    const inserted: unknown[] = []
    const conflicts: unknown[] = []
    const tx = {
      delete: () => ({ where: () => Promise.resolve() }),
      insert: () => ({
        values: (rows: unknown) => {
          inserted.push(rows)
          return {
            onConflictDoUpdate: (config: unknown) => {
              conflicts.push(config)
              return Promise.resolve()
            },
          }
        },
      }),
      update: () => ({
        set: (set: unknown) => ({
          where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            updates.push({ set, where: dialect.sqlToQuery(condition) })
            return Promise.resolve()
          },
        }),
      }),
      query: {
        aiEmbeddingModel: {
          findMany: () =>
            Promise.resolve([
              { id: "c1", status: "pending" },
              { id: "c2", status: "success" },
            ]),
        },
      },
    }
    const repository = new AiFileEmbeddingRepository({
      transaction: (fn: (client: unknown) => unknown) => fn(tx),
    } as unknown as DatabaseClient)

    await expect(
      repository.reconcilePendingChunks({
        aiFileId: "1",
        workspaceId: "workspace-1",
        chunks: [
          { id: "c1", content: "a", chunkIndex: 0 },
          { id: "c2", content: "b", chunkIndex: 1 },
        ],
      }),
    ).resolves.toEqual([{ id: "c1" }])

    // Positions are stored with the row, and a kept row only gains a missing
    // position: status and embedding are not in the conflict update.
    expect(inserted[0]).toEqual([
      expect.objectContaining({ id: "c1", chunkIndex: 0, status: "pending" }),
      expect.objectContaining({ id: "c2", chunkIndex: 1, status: "pending" }),
    ])
    expect(Object.keys((conflicts[0] as { set: object }).set)).toEqual([
      "chunkIndex",
    ])
    expect(conflicts[0]).toHaveProperty("setWhere")

    expect(updates).toHaveLength(1)
    expect(updates[0]?.set).toEqual({ status: "pending" })
    expect(updates[0]?.where.params).toEqual(
      expect.arrayContaining(["1", "workspace-1", "c1", "c2", "error"]),
    )
    // `processing` is never written for file chunks, and `success` keeps its vector.
    expect(updates[0]?.where.params).not.toContain("processing")
    expect(updates[0]?.where.params).not.toContain("success")
  })

  test("rejects an empty chunk set without touching the existing index", async () => {
    const transaction = vi.fn()
    const repository = new AiFileEmbeddingRepository({
      transaction,
    } as unknown as DatabaseClient)

    await expect(
      repository.reconcilePendingChunks({
        aiFileId: "1",
        workspaceId: "workspace-1",
        chunks: [],
      }),
    ).rejects.toThrow("at least one chunk")
    expect(transaction).not.toHaveBeenCalled()
  })
})

describe("AiFileEmbeddingRepository.markEmbeddingFailed", () => {
  const buildClient = (rows: Array<{ id: string }>) => {
    let where: ReturnType<PgDialect["sqlToQuery"]> | undefined
    const returning = vi.fn().mockResolvedValue(rows)
    const whereFn = vi.fn(
      (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        where = dialect.sqlToQuery(condition)
        return { returning }
      },
    )
    const set = vi.fn().mockReturnValue({ where: whereFn })
    const update = vi.fn().mockReturnValue({ set })
    return {
      client: { update } as unknown as DatabaseClient,
      set,
      getWhere: () => where,
    }
  }

  test("marks only a pending chunk of the workspace as error", async () => {
    const { client, set, getWhere } = buildClient([{ id: "emb-1" }])

    await expect(
      new AiFileEmbeddingRepository(client).markEmbeddingFailed({
        embeddingId: "emb-1",
        workspaceId: "ws-A",
      }),
    ).resolves.toBe(true)

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" }),
    )
    expect(getWhere()?.sql).toContain('"workspaceId" = $')
    expect(getWhere()?.sql).toContain('"status" = $')
    expect(getWhere()?.params).toEqual(
      expect.arrayContaining(["emb-1", "ws-A", "pending"]),
    )
  })

  test("reports false when the chunk is no longer pending", async () => {
    const { client } = buildClient([])

    await expect(
      new AiFileEmbeddingRepository(client).markEmbeddingFailed({
        embeddingId: "emb-1",
        workspaceId: "ws-A",
      }),
    ).resolves.toBe(false)
  })
})
