import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  or,
  type SQL,
  sql,
} from "../../client"
import type { SocialPostStatus } from "../../partials/social-post"
import {
  inboxModel,
  postTopicModel,
  publishDestinationModel,
  socialAccountDestinationModel,
  socialPostMediaModel,
  socialPostModel,
  socialPostTargetMediaModel,
  socialPostTargetModel,
  socialPostToPostTopicModel,
} from "../../schema"
import { likeContains } from "../../utils"
import { publishDestinationRepository } from "../publish-destination/repository"
import { publishDestinationStateRepository } from "../publish-destination/state"
import { bucketCondition, countBuckets } from "./buckets"

export {
  EDITABLE_POST_STATUSES,
  type SocialMediaInsert,
  type SocialPostInsert,
  type SocialPostListCursor,
  type SocialPostListFilters,
  type SocialPostTargetInsert,
  type SocialPostTargetPatch,
} from "./columns"

import {
  EDITABLE_POST_STATUSES,
  mediaColumns,
  postColumns,
  type SocialMediaInsert,
  type SocialPostInsert,
  type SocialPostListCursor,
  type SocialPostListFilters,
  type SocialPostTargetInsert,
  type SocialPostTargetPatch,
  targetColumns,
  targetDestinationJoins,
} from "./columns"

export type SocialPostRow = NonNullable<
  Awaited<ReturnType<typeof socialPostRepository.findForWorkspace>>
>
export type SocialPostTargetRow = Awaited<
  ReturnType<typeof socialPostRepository.listTargets>
>[number]
export type SocialPostMediaRow = Awaited<
  ReturnType<typeof socialPostRepository.listPostMedia>
>[number]
export type SocialPostTargetMediaRow = Awaited<
  ReturnType<typeof socialPostRepository.listTargetMedia>
>[number]
export type SocialPostTopicRow = Awaited<
  ReturnType<typeof socialPostRepository.listTopics>
>[number]

const listConditions = (
  workspaceId: string,
  filters: SocialPostListFilters,
): SQL[] => {
  const conditions: (SQL | undefined)[] = [
    eq(socialPostModel.workspaceId, workspaceId),
  ]
  if (filters.statuses?.length) {
    conditions.push(inArray(socialPostModel.status, filters.statuses))
  }
  if (filters.bucket) {
    conditions.push(bucketCondition(filters.bucket, workspaceId))
  }
  if (filters.from || filters.to) {
    // The calendar's meaning of a post's time: some destination's effective
    // time (published, else scheduled) falls inside the range.
    const inRange: SQL[] = [
      eq(socialPostTargetModel.socialPostId, socialPostModel.id),
      eq(socialPostTargetModel.workspaceId, workspaceId),
    ]
    if (filters.from) {
      inRange.push(
        sql`COALESCE(${socialPostTargetModel.publishedAt}, ${socialPostTargetModel.scheduledAt}) >= ${filters.from.toISOString()}::timestamptz`,
      )
    }
    if (filters.to) {
      inRange.push(
        sql`COALESCE(${socialPostTargetModel.publishedAt}, ${socialPostTargetModel.scheduledAt}) <= ${filters.to.toISOString()}::timestamptz`,
      )
    }
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(socialPostTargetModel)
          .where(and(...inRange)),
      ),
    )
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(socialPostModel.text, likeContains(filters.search)),
        ilike(socialPostModel.linkUrl, likeContains(filters.search)),
      ),
    )
  }
  if (filters.providers?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(socialPostTargetModel)
          .where(
            and(
              eq(socialPostTargetModel.socialPostId, socialPostModel.id),
              eq(socialPostTargetModel.workspaceId, workspaceId),
              inArray(socialPostTargetModel.provider, filters.providers),
            ),
          ),
      ),
    )
  }
  if (filters.destinationIds?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(socialPostTargetModel)
          .where(
            and(
              eq(socialPostTargetModel.socialPostId, socialPostModel.id),
              eq(socialPostTargetModel.workspaceId, workspaceId),
              inArray(
                socialPostTargetModel.publishDestinationId,
                filters.destinationIds,
              ),
            ),
          ),
      ),
    )
  }
  if (filters.inboxIds?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(socialPostTargetModel)
          .innerJoin(
            publishDestinationModel,
            and(
              eq(
                publishDestinationModel.id,
                socialPostTargetModel.publishDestinationId,
              ),
              eq(publishDestinationModel.workspaceId, workspaceId),
            ),
          )
          .where(
            and(
              eq(socialPostTargetModel.socialPostId, socialPostModel.id),
              eq(socialPostTargetModel.workspaceId, workspaceId),
              inArray(publishDestinationModel.inboxId, filters.inboxIds),
            ),
          ),
      ),
    )
  }
  if (filters.topicIds?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(socialPostToPostTopicModel)
          .innerJoin(
            postTopicModel,
            and(
              eq(postTopicModel.id, socialPostToPostTopicModel.postTopicId),
              eq(postTopicModel.workspaceId, workspaceId),
            ),
          )
          .where(
            and(
              eq(socialPostToPostTopicModel.socialPostId, socialPostModel.id),
              inArray(socialPostToPostTopicModel.postTopicId, filters.topicIds),
            ),
          ),
      ),
    )
  }
  return conditions.filter((condition): condition is SQL => Boolean(condition))
}

export const socialPostRepository = {
  /**
   * Inserts the post, or returns `null` when it conflicts with a unique key (the
   * caller's idempotency key already created one). The unique index decides the
   * winner of two concurrent creates.
   */
  async insertPost(
    values: SocialPostInsert,
    tx: DatabaseClient = db,
  ): Promise<{ id: string } | null> {
    const [row] = await tx
      .insert(socialPostModel)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: socialPostModel.id })
    return row ?? null
  },

  async findByIdempotencyKey(
    input: { idempotencyKey: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select({
        id: socialPostModel.id,
        idempotencyRequestHash: socialPostModel.idempotencyRequestHash,
      })
      .from(socialPostModel)
      .where(
        and(
          eq(socialPostModel.workspaceId, input.workspaceId),
          eq(socialPostModel.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
    return row ?? null
  },

  async findForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select(postColumns())
      .from(socialPostModel)
      .where(
        and(
          eq(socialPostModel.id, input.id),
          eq(socialPostModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /** Locks the post row for the rest of the transaction: edits of one post serialise. */
  async lockForUpdate(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<{
    id: string
    linkUrl: string | null
    status: SocialPostStatus
  } | null> {
    const [row] = await tx
      .select({
        id: socialPostModel.id,
        linkUrl: socialPostModel.linkUrl,
        status: socialPostModel.status,
      })
      .from(socialPostModel)
      .where(
        and(
          eq(socialPostModel.id, input.id),
          eq(socialPostModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
      .for("update")
    return row ?? null
  },

  /** One page of posts, newest first; `limit` rows plus one to know whether more follow. */
  async list(
    input: {
      cursor?: SocialPostListCursor
      filters: SocialPostListFilters
      limit: number
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const conditions = listConditions(input.workspaceId, input.filters)
    if (input.cursor) {
      conditions.push(
        sql`(${socialPostModel.createdAt}, ${socialPostModel.id}) < (${input.cursor.createdAt}::timestamptz, ${input.cursor.id}::bigint)`,
      )
    }
    return await tx
      .select(postColumns())
      .from(socialPostModel)
      .where(and(...conditions))
      .orderBy(desc(socialPostModel.createdAt), desc(socialPostModel.id))
      .limit(input.limit + 1)
  },

  /**
   * How many posts each bucket holds, in one grouped statement. Narrowed by the
   * destination-like filters of the list (network, destination, inbox, topic,
   * text); the state and time filters are what the buckets and the date range
   * replace, so they are ignored here.
   */
  async countByBucket(input: {
    filters: SocialPostListFilters
    workspaceId: string
  }) {
    const {
      bucket: _b,
      from: _f,
      statuses: _s,
      to: _t,
      ...narrowing
    } = input.filters
    return await countBuckets(
      input.workspaceId,
      listConditions(input.workspaceId, narrowing),
    )
  },

  async listTargets(
    input: { postIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    if (input.postIds.length === 0) {
      return []
    }
    const joins = targetDestinationJoins(input.workspaceId)
    return await tx
      .select(targetColumns())
      .from(socialPostTargetModel)
      .innerJoin(publishDestinationModel, joins.binding)
      .leftJoin(inboxModel, joins.inbox)
      .leftJoin(socialAccountDestinationModel, joins.socialDestination)
      .where(
        and(
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          sql`${socialPostTargetModel.socialPostId} = ANY(${sql.param(input.postIds)}::bigint[])`,
        ),
      )
      .orderBy(socialPostTargetModel.createdAt, socialPostTargetModel.id)
  },

  async listPostMedia(
    input: { postIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    if (input.postIds.length === 0) {
      return []
    }
    return await tx
      .select({
        ...mediaColumns(socialPostMediaModel),
        socialPostId: socialPostMediaModel.socialPostId,
      })
      .from(socialPostMediaModel)
      .where(
        and(
          eq(socialPostMediaModel.workspaceId, input.workspaceId),
          sql`${socialPostMediaModel.socialPostId} = ANY(${sql.param(input.postIds)}::bigint[])`,
        ),
      )
      .orderBy(socialPostMediaModel.socialPostId, socialPostMediaModel.position)
  },

  async listTargetMedia(
    input: { targetIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    if (input.targetIds.length === 0) {
      return []
    }
    return await tx
      .select({
        ...mediaColumns(socialPostTargetMediaModel),
        socialPostTargetId: socialPostTargetMediaModel.socialPostTargetId,
      })
      .from(socialPostTargetMediaModel)
      .where(
        and(
          eq(socialPostTargetMediaModel.workspaceId, input.workspaceId),
          sql`${socialPostTargetMediaModel.socialPostTargetId} = ANY(${sql.param(input.targetIds)}::bigint[])`,
        ),
      )
      .orderBy(
        socialPostTargetMediaModel.socialPostTargetId,
        socialPostTargetMediaModel.position,
      )
  },

  async listTopics(
    input: { postIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    if (input.postIds.length === 0) {
      return []
    }
    return await tx
      .select({
        color: postTopicModel.color,
        id: postTopicModel.id,
        name: postTopicModel.name,
        socialPostId: socialPostToPostTopicModel.socialPostId,
      })
      .from(socialPostToPostTopicModel)
      .innerJoin(
        postTopicModel,
        eq(postTopicModel.id, socialPostToPostTopicModel.postTopicId),
      )
      .where(
        and(
          eq(postTopicModel.workspaceId, input.workspaceId),
          sql`${socialPostToPostTopicModel.socialPostId} = ANY(${sql.param(input.postIds)}::bigint[])`,
        ),
      )
      .orderBy(postTopicModel.name, postTopicModel.id)
  },

  /** Topics of this workspace among `ids`: a foreign id is simply not returned. */
  async findTopicIds(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: postTopicModel.id })
      .from(postTopicModel)
      .where(
        and(
          eq(postTopicModel.workspaceId, input.workspaceId),
          sql`${postTopicModel.id} = ANY(${sql.param(input.ids)}::bigint[])`,
        ),
      )
    return rows.map((row) => row.id)
  },

  /**
   * The destinations of this workspace among `ids` with the state the rules
   * need. A destination of another workspace is not returned.
   */
  async findDestinations(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await publishDestinationStateRepository.list(
      { ids: input.ids, workspaceId: input.workspaceId },
      tx,
    )
    return rows.map((row) => ({
      id: row.id,
      inboxId: row.inboxId,
      provider: row.provider,
      publisherKey: row.publisherKey,
      socialAccountId: row.socialAccountId,
      state: row.state,
      viaFacebook: row.viaFacebook,
    }))
  },

  async insertTargets(rows: SocialPostTargetInsert[], tx: DatabaseClient) {
    if (rows.length === 0) {
      return
    }
    // Every destination must belong to the workspace of the row that names it.
    for (const workspaceId of new Set(rows.map((row) => row.workspaceId))) {
      await publishDestinationRepository.assertInWorkspace(
        {
          ids: rows
            .filter((row) => row.workspaceId === workspaceId)
            .map((row) => row.publishDestinationId),
          workspaceId,
        },
        tx,
      )
    }
    await tx.insert(socialPostTargetModel).values(rows)
  },

  async insertPostMedia(
    input: { rows: SocialMediaInsert[]; socialPostId: string },
    tx: DatabaseClient,
  ) {
    if (input.rows.length > 0) {
      await tx.insert(socialPostMediaModel).values(
        input.rows.map((row) => ({
          ...row,
          socialPostId: input.socialPostId,
        })),
      )
    }
  },

  async insertTargetMedia(
    input: { rows: SocialMediaInsert[]; socialPostTargetId: string },
    tx: DatabaseClient,
  ) {
    if (input.rows.length > 0) {
      await tx.insert(socialPostTargetMediaModel).values(
        input.rows.map((row) => ({
          ...row,
          socialPostTargetId: input.socialPostTargetId,
        })),
      )
    }
  },

  async replaceTopics(
    input: { postTopicIds: string[]; socialPostId: string },
    tx: DatabaseClient,
  ) {
    await tx
      .delete(socialPostToPostTopicModel)
      .where(eq(socialPostToPostTopicModel.socialPostId, input.socialPostId))
    if (input.postTopicIds.length > 0) {
      await tx.insert(socialPostToPostTopicModel).values(
        input.postTopicIds.map((postTopicId) => ({
          postTopicId,
          socialPostId: input.socialPostId,
        })),
      )
    }
  },

  async deletePostMedia(
    input: { socialPostId: string; workspaceId: string },
    tx: DatabaseClient,
  ) {
    await tx
      .delete(socialPostMediaModel)
      .where(
        and(
          eq(socialPostMediaModel.socialPostId, input.socialPostId),
          eq(socialPostMediaModel.workspaceId, input.workspaceId),
        ),
      )
  },

  async deleteTargetMedia(
    input: { socialPostTargetId: string; workspaceId: string },
    tx: DatabaseClient,
  ) {
    await tx
      .delete(socialPostTargetMediaModel)
      .where(
        and(
          eq(
            socialPostTargetMediaModel.socialPostTargetId,
            input.socialPostTargetId,
          ),
          eq(socialPostTargetMediaModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /** Pending targets of the post whose destination is not in `keepDestinationIds` are removed. */
  async deleteTargetsExcept(
    input: {
      keepDestinationIds: string[]
      socialPostId: string
      workspaceId: string
    },
    tx: DatabaseClient,
  ) {
    await tx
      .delete(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, input.socialPostId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "pending"),
          input.keepDestinationIds.length > 0
            ? sql`${socialPostTargetModel.publishDestinationId} <> ALL(${sql.param(input.keepDestinationIds)}::bigint[])`
            : undefined,
        ),
      )
  },

  async updateTarget(
    input: { id: string; patch: SocialPostTargetPatch; workspaceId: string },
    tx: DatabaseClient,
  ) {
    await tx
      .update(socialPostTargetModel)
      .set({ ...input.patch, updatedAt: new Date() })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /**
   * Edits the post's shared fields while it is still editable. `false` means the
   * post is gone or already past editing.
   */
  async updateEditable(
    input: {
      id: string
      linkUrl?: string | null
      text?: string | null
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const changes: { linkUrl?: string | null; text?: string | null } = {}
    if (input.text !== undefined) {
      changes.text = input.text
    }
    if (input.linkUrl !== undefined) {
      changes.linkUrl = input.linkUrl
    }
    const rows = await tx
      .update(socialPostModel)
      .set({ ...changes, updatedAt: new Date() })
      .where(
        and(
          eq(socialPostModel.id, input.id),
          eq(socialPostModel.workspaceId, input.workspaceId),
          inArray(socialPostModel.status, [...EDITABLE_POST_STATUSES]),
        ),
      )
      .returning({ id: socialPostModel.id })
    return rows.length > 0
  },

  /** Deletes a draft with its targets, media and topic links (cascade). `false` when it is not a draft. */
  async deleteDraft(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .delete(socialPostModel)
      .where(
        and(
          eq(socialPostModel.id, input.id),
          eq(socialPostModel.workspaceId, input.workspaceId),
          eq(socialPostModel.status, "draft"),
        ),
      )
      .returning({ id: socialPostModel.id })
    return rows.length > 0
  },
}
