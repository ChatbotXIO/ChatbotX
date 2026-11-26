import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import {
  HEAVY_WORKSPACE_TABLES,
  PARTITIONED_WORKSPACE_TABLES,
  workspacePurgeRepository,
} from "../src/repositories/workspace-purge"

const heavyPosition = (table: string): number =>
  (HEAVY_WORKSPACE_TABLES as readonly string[]).indexOf(table)

const dialect = new PgDialect()
const render = (query: unknown): { params: unknown[]; text: string } => {
  const { sql: text, params } = dialect.sqlToQuery(query as never)
  return { params, text: text.replace(/\s+/g, " ").trim() }
}

describe("channel post purge", () => {
  test("posts drain in the heavy stage, after the targets that point at them", () => {
    const post = heavyPosition("ChannelPost")

    expect(post).toBeGreaterThanOrEqual(0)
    expect(post).toBeGreaterThan(heavyPosition("SocialPostTarget"))
  })

  test("topic links are drained through their post, in the stage before the posts", () => {
    const spec = PARTITIONED_WORKSPACE_TABLES.find(
      (candidate) => candidate.table === "ChannelPostToPostTopic",
    )

    expect(spec?.selector).toBe("channelPostWorkspace")
  })

  test("a link batch is bounded, locked, selected through the post's workspace", async () => {
    const execute = vi.fn().mockResolvedValue({ rowCount: 3 })
    const spec = PARTITIONED_WORKSPACE_TABLES.find(
      (candidate) => candidate.table === "ChannelPostToPostTopic",
    )
    if (!spec) {
      throw new Error("spec missing")
    }

    const deleted = await workspacePurgeRepository.deletePartitionedBatch(
      spec,
      "7",
      500,
      { execute } as never,
    )

    const { text, params } = render(execute.mock.calls[0]?.[0])
    expect(deleted).toBe(3)
    expect(text).toContain('DELETE FROM "ChannelPostToPostTopic"')
    expect(text).toContain('INNER JOIN "ChannelPost" AS parent')
    expect(text).toContain('child."channelPostId"')
    expect(text).toContain('parent."workspaceId" = $1')
    expect(text).toContain("LIMIT $2 FOR UPDATE OF child SKIP LOCKED")
    expect(params).toEqual(["7", 500])
  })
})
