import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { ConversationEmbeddingRepository } from "../src/repositories/ai-conversation-embedding/repository"

const dialect = new PgDialect()

describe("ConversationEmbeddingRepository workspace scoping", () => {
  test("vector search filters by workspace as well as source", async () => {
    let captured: ReturnType<PgDialect["sqlToQuery"]> | undefined
    const execute = vi.fn((query) => {
      captured = dialect.sqlToQuery(query)
      return Promise.resolve({ rows: [] })
    })
    const repository = new ConversationEmbeddingRepository({
      execute,
    } as unknown as DatabaseClient)

    await repository.vectorSearch({
      sourceId: "source-1",
      workspaceId: "workspace-1",
      queryVector: "[0.1]",
      topK: 3,
    })

    expect(captured?.sql).toContain('"sourceId" = $')
    expect(captured?.sql).toContain('"workspaceId" = $')
    expect(captured?.params).toEqual(
      expect.arrayContaining(["source-1", "workspace-1"]),
    )
  })

  test("listing chunks by source filters by workspace", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const repository = new ConversationEmbeddingRepository({
      query: { aiConversationEmbeddingModel: { findMany } },
    } as unknown as DatabaseClient)

    await repository.findManyBySource({
      sourceId: "source-1",
      workspaceId: "workspace-1",
      limit: 5,
    })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceId: "source-1",
          workspaceId: "workspace-1",
        }),
      }),
    )
  })
})
