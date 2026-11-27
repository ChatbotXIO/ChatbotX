import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { aiConversationEmbeddingModel } from "../src/schema/ai-conversation-embedding"
import { aiEmbeddingModel } from "../src/schema/ai-embedding"
import { contactsOnBroadcastsModel } from "../src/schema/contact-on-broadcast"
import { contactsToTagsModel } from "../src/schema/contact-to-tag"
import { flowRunModel } from "../src/schema/flow-run"
import { flowVersionModel } from "../src/schema/flow-version"
import { leaderboardParticipantModel } from "../src/schema/leaderboard-participant"
import { sequenceDispatchModel } from "../src/schema/sequence-dispatch"

const NORMAL_MIGRATION_PATH = join(
  import.meta.dirname,
  "../drizzle/20261025020838_add_workspace_purge_indexes/migration.sql",
)
const PARTITIONED_MIGRATION_PATH = join(
  import.meta.dirname,
  "../drizzle/20261025020711_add_workspace_purge_partitioned_indexes/migration.sql",
)

// A purge index that a later migration replaced with a wider index. The
// replacement must keep the FK columns as its leading prefix and be built
// before the original is dropped, so the FK is never left unindexed.
const supersededIndexes: Record<
  string,
  { columns: readonly string[]; index: string; migration: string }
> = {
  AIEmbedding_aiFileId_idx: {
    columns: ["aiFileId", "chunkIndex"],
    index: "AIEmbedding_aiFileId_chunkIndex_idx",
    migration: join(
      import.meta.dirname,
      "../drizzle/20261026060700_add_ai_embedding_chunk_index_idx/migration.sql",
    ),
  },
}

const normalTargets = [
  {
    columns: ["workspaceId", "conversationId", "sourceId", "status"],
    index: "AIConversationEmbedding_lookup_idx",
    model: aiConversationEmbeddingModel,
    table: "AIConversationEmbedding",
  },
  {
    columns: ["aiFileId"],
    index: "AIEmbedding_aiFileId_idx",
    model: aiEmbeddingModel,
    table: "AIEmbedding",
  },
  {
    columns: ["tagId"],
    index: "ContactToTag_tagId_idx",
    model: contactsToTagsModel,
    table: "ContactToTag",
  },
  {
    columns: ["workspaceId"],
    index: "FlowRun_workspaceId_idx",
    model: flowRunModel,
    table: "FlowRun",
  },
  {
    columns: ["flowId"],
    index: "FlowRun_flowId_idx",
    model: flowRunModel,
    table: "FlowRun",
  },
  {
    columns: ["flowVersionId"],
    index: "FlowRun_flowVersionId_idx",
    model: flowRunModel,
    table: "FlowRun",
  },
  {
    columns: ["workspaceId"],
    index: "FlowVersion_workspaceId_idx",
    model: flowVersionModel,
    table: "FlowVersion",
  },
  {
    columns: ["flowId"],
    index: "FlowVersion_flowId_idx",
    model: flowVersionModel,
    table: "FlowVersion",
  },
  {
    columns: ["workspaceId"],
    index: "LeaderboardParticipant_workspaceId_idx",
    model: leaderboardParticipantModel,
    table: "LeaderboardParticipant",
  },
  {
    columns: ["referrerContactId"],
    index: "LeaderboardParticipant_referrerContactId_idx",
    model: leaderboardParticipantModel,
    table: "LeaderboardParticipant",
  },
] as const

const partitionedTargets = [
  {
    columns: ["conversationId"],
    index: "ContactOnBroadcast_conversationId_idx",
    model: contactsOnBroadcastsModel,
    partitions: 64,
    table: "ContactOnBroadcast",
  },
  {
    columns: ["sequenceId"],
    index: "SequenceDispatch_sequenceId_idx",
    model: sequenceDispatchModel,
    partitions: 64,
    table: "SequenceDispatch",
  },
  {
    columns: ["stepId"],
    index: "SequenceDispatch_stepId_idx",
    model: sequenceDispatchModel,
    partitions: 64,
    table: "SequenceDispatch",
  },
] as const

const indexColumns = (
  model: Parameters<typeof getTableConfig>[0],
  index: string,
) => {
  const candidate = getTableConfig(model).indexes.find(
    (entry) => entry.config.name === index,
  )
  expect(candidate).toBeDefined()
  return candidate?.config.columns.map((column) =>
    "name" in column ? column.name : String(column),
  )
}

describe("workspace purge FK indexes", () => {
  test.each(normalTargets)("$table declares $index with the exact FK prefix", ({
    columns,
    index,
    model,
  }) => {
    const replacement = supersededIndexes[index]
    const actual = indexColumns(model, replacement?.index ?? index)
    expect(actual?.slice(0, columns.length)).toEqual(columns)
    expect(actual).toEqual(replacement?.columns ?? columns)
  })

  test.each(
    Object.entries(supersededIndexes),
  )("%s is replaced before it is dropped", (original, replacement) => {
    const sql = readFileSync(replacement.migration, "utf8")
    const create = sql.indexOf(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${replacement.index}"`,
    )
    const drop = sql.indexOf(`DROP INDEX CONCURRENTLY IF EXISTS "${original}"`)
    expect(create).toBeGreaterThanOrEqual(0)
    expect(drop).toBeGreaterThan(create)
  })

  test.each(
    partitionedTargets,
  )("$table declares $index with the exact FK prefix", ({
    columns,
    index,
    model,
  }) => {
    expect(indexColumns(model, index)).toEqual(columns)
  })

  test("normal indexes build concurrently and are restart safe", () => {
    const sql = readFileSync(NORMAL_MIGRATION_PATH, "utf8")
    for (const { index, table } of normalTargets) {
      expect(sql).toContain(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${index}" ON "${table}"`,
      )
      expect(sql).toContain(`to_regclass('"${index}"')`)
      expect(sql).toContain(`DROP INDEX "${index}"`)
      expect(sql).not.toContain(`'"${index}"'::regclass`)
    }
  })

  test.each(
    partitionedTargets,
  )("$table builds all child indexes concurrently and attaches the parent", ({
    index,
    partitions,
    table,
  }) => {
    const statements = readFileSync(PARTITIONED_MIGRATION_PATH, "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean)
    const childIndexSuffix = index.slice(table.length + 1)
    const childIndexes = statements.filter(
      (statement) =>
        statement.startsWith(
          `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${table}_p`,
        ) && statement.includes(`_${childIndexSuffix}"`),
    )
    expect(childIndexes).toHaveLength(partitions)
    expect(
      statements.some((statement) =>
        statement.includes(
          `CREATE INDEX IF NOT EXISTS "${index}" ON ONLY "${table}"`,
        ),
      ),
    ).toBe(true)
    expect(
      statements.some((statement) =>
        statement.includes(`ALTER INDEX "${index}" ATTACH PARTITION`),
      ),
    ).toBe(true)
  })
})
