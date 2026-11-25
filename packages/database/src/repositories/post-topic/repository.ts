import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  ilike,
  inArray,
  notInArray,
  sql,
} from "../../client"
import { channelPostToPostTopicModel, postTopicModel } from "../../schema"
import { likeContains } from "../../utils"

// Built when a query runs, not when the module loads (a test that mocks the
// schema must be able to import the repositories).
const topicColumns = () => ({
  color: postTopicModel.color,
  id: postTopicModel.id,
  name: postTopicModel.name,
})

export const postTopicRepository = {
  async list(
    input: { limit: number; search?: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select(topicColumns())
      .from(postTopicModel)
      .where(
        and(
          eq(postTopicModel.workspaceId, input.workspaceId),
          input.search
            ? ilike(postTopicModel.name, likeContains(input.search))
            : undefined,
        ),
      )
      .orderBy(asc(postTopicModel.name), asc(postTopicModel.id))
      .limit(input.limit)
  },

  async findById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select(topicColumns())
      .from(postTopicModel)
      .where(
        and(
          eq(postTopicModel.id, input.id),
          eq(postTopicModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  /** Serialises topic creation in a workspace until the transaction ends. */
  async lockWorkspaceTopics(
    workspaceId: string,
    tx: DatabaseClient,
  ): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('post-topics:' || ${workspaceId}::text, 0))`,
    )
  },

  async countByWorkspace(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      postTopicModel,
      eq(postTopicModel.workspaceId, workspaceId),
    )
  },

  /** The ids, among `ids`, of topics that belong to the workspace. */
  async findExistingIds(
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
          inArray(postTopicModel.id, input.ids),
        ),
      )

    return rows.map((row) => row.id)
  },

  /** `null` when the name is already taken in the workspace. */
  async insert(
    input: { color: string | null; name: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(postTopicModel)
      .values(input)
      .onConflictDoNothing({
        target: [postTopicModel.workspaceId, postTopicModel.name],
      })
      .returning(topicColumns())

    return row ?? null
  },

  /** `null` when the topic does not exist; throws a unique violation on a taken name. */
  async update(
    input: {
      color?: string | null
      id: string
      name?: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const { id, workspaceId, ...changes } = input
    const [row] = await tx
      .update(postTopicModel)
      .set({ ...changes, updatedAt: new Date() })
      .where(
        and(
          eq(postTopicModel.id, id),
          eq(postTopicModel.workspaceId, workspaceId),
        ),
      )
      .returning(topicColumns())

    return row ?? null
  },

  async delete(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .delete(postTopicModel)
      .where(
        and(
          eq(postTopicModel.id, input.id),
          eq(postTopicModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: postTopicModel.id })

    return rows.length > 0
  },

  async listForPosts(
    input: { channelPostIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.channelPostIds.length === 0) {
      return []
    }
    return await tx
      .select({
        channelPostId: channelPostToPostTopicModel.channelPostId,
        color: postTopicModel.color,
        id: postTopicModel.id,
        name: postTopicModel.name,
      })
      .from(channelPostToPostTopicModel)
      .innerJoin(
        postTopicModel,
        eq(postTopicModel.id, channelPostToPostTopicModel.postTopicId),
      )
      .where(
        inArray(
          channelPostToPostTopicModel.channelPostId,
          input.channelPostIds,
        ),
      )
      .orderBy(asc(postTopicModel.name), asc(postTopicModel.id))
  },

  /** Makes each post carry exactly `topicIds`: removes the rest, adds the missing. */
  async replaceForPosts(
    input: { channelPostIds: string[]; topicIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(channelPostToPostTopicModel)
      .where(
        and(
          inArray(
            channelPostToPostTopicModel.channelPostId,
            input.channelPostIds,
          ),
          input.topicIds.length > 0
            ? notInArray(
                channelPostToPostTopicModel.postTopicId,
                input.topicIds,
              )
            : undefined,
        ),
      )
    await postTopicRepository.addToPosts(input, tx)
  },

  async addToPosts(
    input: { channelPostIds: string[]; topicIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const rows = input.channelPostIds.flatMap((channelPostId) =>
      input.topicIds.map((postTopicId) => ({ channelPostId, postTopicId })),
    )
    if (rows.length === 0) {
      return
    }
    await tx
      .insert(channelPostToPostTopicModel)
      .values(rows)
      .onConflictDoNothing()
  },

  async removeFromPosts(
    input: { channelPostIds: string[]; topicIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.topicIds.length === 0) {
      return
    }
    await tx
      .delete(channelPostToPostTopicModel)
      .where(
        and(
          inArray(
            channelPostToPostTopicModel.channelPostId,
            input.channelPostIds,
          ),
          inArray(channelPostToPostTopicModel.postTopicId, input.topicIds),
        ),
      )
  },

  /** Ids, among `channelPostIds`, of posts that carry more than `limit` topics. */
  async findPostsOverTopicLimit(
    input: { channelPostIds: string[]; limit: number },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx
      .select({ channelPostId: channelPostToPostTopicModel.channelPostId })
      .from(channelPostToPostTopicModel)
      .where(
        inArray(
          channelPostToPostTopicModel.channelPostId,
          input.channelPostIds,
        ),
      )
      .groupBy(channelPostToPostTopicModel.channelPostId)
      .having(sql`count(*) > ${input.limit}`)

    return rows.map((row) => row.channelPostId)
  },
}
