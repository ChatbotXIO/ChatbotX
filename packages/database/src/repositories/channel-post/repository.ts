import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  sql,
} from "../../client"
import {
  type ChannelPostIntegrationType,
  channelPostIntegrationTypes,
} from "../../partials"
import { channelPostModel, inboxModel } from "../../schema"

export type ChannelPostMetadata = {
  caption: string | null
  mediaType: string | null
  permalink: string | null
  publishedAt: Date | null
  thumbnail: string | null
}

export type ChannelPostFilterCursor = {
  id: string
  // PostgreSQL timestamps carry microseconds while JavaScript Dates carry
  // milliseconds. Keep node-postgres's raw value through the cursor so a
  // keyset boundary never rounds and skips posts created in the same ms.
  sortAt: string
}

const channelPostScope = (workspaceId: string) =>
  eq(channelPostModel.workspaceId, workspaceId)

export const channelPostRepository = {
  async findByExternalId(
    input: { externalPostId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<{
    id: string
    integrationId: string
    integrationType: ChannelPostIntegrationType
    metadataFetchedAt: Date | null
  } | null> {
    const [row] = await tx
      .select({
        id: channelPostModel.id,
        integrationId: channelPostModel.integrationId,
        integrationType: channelPostModel.integrationType,
        metadataFetchedAt: channelPostModel.metadataFetchedAt,
      })
      .from(channelPostModel)
      .where(
        and(
          channelPostScope(input.workspaceId),
          eq(channelPostModel.externalPostId, input.externalPostId),
        ),
      )
      .limit(1)

    return row
      ? {
          ...row,
          integrationType: channelPostIntegrationTypes.parse(
            row.integrationType,
          ),
        }
      : null
  },

  async insertBare(
    input: {
      externalPostId: string
      inboxId: string
      integrationId: string
      integrationType: ChannelPostIntegrationType
      sourceAccountId: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .insert(channelPostModel)
      .values({ ...input, metadataAttemptedAt: new Date() })
      .onConflictDoNothing({
        target: [channelPostModel.workspaceId, channelPostModel.externalPostId],
      })
      .returning({ id: channelPostModel.id })

    return row?.id ?? null
  },

  async updateIntegrationIfChanged(
    input: {
      externalPostId: string
      inboxId: string
      integrationId: string
      integrationType: ChannelPostIntegrationType
      sourceAccountId: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const result = await tx.execute(sql`
      UPDATE "ChannelPost"
      SET
        "integrationId" = ${input.integrationId}::bigint,
        "integrationType" = ${input.integrationType}::"channelPostIntegrationType",
        "inboxId" = ${input.inboxId}::bigint,
        "sourceAccountId" = ${input.sourceAccountId},
        "updatedAt" = NOW()
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "externalPostId" = ${input.externalPostId}
        AND ("integrationId", "integrationType") IS DISTINCT FROM (
          ${input.integrationId}::bigint,
          ${input.integrationType}::"channelPostIntegrationType"
        )
      RETURNING "id"
    `)

    return (result.rowCount ?? 0) > 0
  },

  async claimMetadataRetry(
    input: {
      id: string
      maxRetryAgeMs: number
      retryIntervalMs: number
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    // Bounded by post age: a post whose metadata never resolves within
    // `maxRetryAgeMs` stops being retried, so a deleted/inaccessible post can
    // no longer spend the inline fetch budget on every future comment. The
    // bare row remains usable (the picker falls back to the external id).
    const result = await tx.execute(sql`
      UPDATE "ChannelPost"
      SET "metadataAttemptedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${input.id}::bigint
        AND "workspaceId" = ${input.workspaceId}::bigint
        AND "metadataFetchedAt" IS NULL
        AND "createdAt" > NOW() - (${input.maxRetryAgeMs}::bigint * INTERVAL '1 millisecond')
        AND "metadataAttemptedAt" < NOW() - (${input.retryIntervalMs}::int * INTERVAL '1 millisecond')
      RETURNING "id"
    `)

    return (result.rowCount ?? 0) > 0
  },

  async saveMetadata(
    input: { id: string; metadata: ChannelPostMetadata; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(channelPostModel)
      .set({
        ...input.metadata,
        metadataFetchedAt: new Date(),
      })
      .where(
        and(
          eq(channelPostModel.id, input.id),
          channelPostScope(input.workspaceId),
        ),
      )
  },

  async markMetadataAttempt(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(channelPostModel)
      .set({ metadataAttemptedAt: new Date() })
      .where(
        and(
          eq(channelPostModel.id, input.id),
          channelPostScope(input.workspaceId),
        ),
      )
  },

  async listFilterOptions(
    input: {
      cursor?: ChannelPostFilterCursor
      limit: number
      search?: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const channelPostSortAt = sql<string>`COALESCE(${channelPostModel.publishedAt}, ${channelPostModel.createdAt})`
    const conditions = [channelPostScope(input.workspaceId)]
    if (input.search) {
      conditions.push(ilike(channelPostModel.caption, `%${input.search}%`))
    }
    if (input.cursor) {
      const cursorCondition = or(
        lt(channelPostSortAt, input.cursor.sortAt),
        and(
          eq(channelPostSortAt, input.cursor.sortAt),
          lt(channelPostModel.id, input.cursor.id),
        ),
      )
      if (cursorCondition) {
        conditions.push(cursorCondition)
      }
    }

    return await tx
      .select({
        caption: channelPostModel.caption,
        createdAt: channelPostModel.createdAt,
        externalPostId: channelPostModel.externalPostId,
        id: channelPostModel.id,
        inboxId: channelPostModel.inboxId,
        inboxName: inboxModel.name,
        integrationType: channelPostModel.integrationType,
        permalink: channelPostModel.permalink,
        publishedAt: channelPostModel.publishedAt,
        sortAt: channelPostSortAt,
        thumbnail: channelPostModel.thumbnail,
      })
      .from(channelPostModel)
      .innerJoin(inboxModel, eq(inboxModel.id, channelPostModel.inboxId))
      .where(and(...conditions))
      // `id DESC NULLS LAST` (not drizzle's default NULLS FIRST) so the order
      // matches ChannelPost_workspaceId_sortAt_id_idx exactly and the planner
      // serves it from the index with no Sort node. id is NOT NULL, so NULLS
      // placement changes nothing about the result.
      .orderBy(
        desc(channelPostSortAt),
        sql`${channelPostModel.id} DESC NULLS LAST`,
      )
      .limit(input.limit)
  },

  async findByIds(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const ids = Array.from(new Set(input.ids))
    if (ids.length === 0) {
      return []
    }

    return await tx
      .select({
        caption: channelPostModel.caption,
        externalPostId: channelPostModel.externalPostId,
        id: channelPostModel.id,
        inboxId: channelPostModel.inboxId,
        inboxName: inboxModel.name,
        integrationType: channelPostModel.integrationType,
        permalink: channelPostModel.permalink,
        publishedAt: channelPostModel.publishedAt,
        thumbnail: channelPostModel.thumbnail,
      })
      .from(channelPostModel)
      .innerJoin(inboxModel, eq(inboxModel.id, channelPostModel.inboxId))
      .where(
        and(
          channelPostScope(input.workspaceId),
          inArray(channelPostModel.id, ids),
        ),
      )
  },
}
