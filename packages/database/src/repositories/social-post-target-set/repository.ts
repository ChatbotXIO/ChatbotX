import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
} from "../../client"
import {
  socialPostTargetSetDestinationModel,
  socialPostTargetSetModel,
} from "../../schema"
import {
  PublishDestinationWorkspaceError,
  publishDestinationRepository,
} from "../publish-destination/repository"

const setColumns = () => ({
  id: socialPostTargetSetModel.id,
  name: socialPostTargetSetModel.name,
})

export const socialPostTargetSetRepository = {
  async list(
    input: { limit: number; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select(setColumns())
      .from(socialPostTargetSetModel)
      .where(eq(socialPostTargetSetModel.workspaceId, input.workspaceId))
      .orderBy(
        asc(socialPostTargetSetModel.name),
        asc(socialPostTargetSetModel.id),
      )
      .limit(input.limit)
  },

  async findById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select(setColumns())
      .from(socialPostTargetSetModel)
      .where(
        and(
          eq(socialPostTargetSetModel.id, input.id),
          eq(socialPostTargetSetModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  /** Serialises set creation in a workspace until the transaction ends. */
  async lockWorkspaceSets(
    workspaceId: string,
    tx: DatabaseClient,
  ): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('post-target-sets:' || ${workspaceId}::text, 0))`,
    )
  },

  async countByWorkspace(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      socialPostTargetSetModel,
      eq(socialPostTargetSetModel.workspaceId, workspaceId),
    )
  },

  /** `null` when the name is already taken in the workspace. */
  async insert(
    input: { name: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(socialPostTargetSetModel)
      .values(input)
      .onConflictDoNothing({
        target: [
          socialPostTargetSetModel.workspaceId,
          socialPostTargetSetModel.name,
        ],
      })
      .returning(setColumns())

    return row ?? null
  },

  /** `null` when the set does not exist; throws a unique violation on a taken name. */
  async rename(
    input: { id: string; name: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(socialPostTargetSetModel)
      .set({ name: input.name, updatedAt: new Date() })
      .where(
        and(
          eq(socialPostTargetSetModel.id, input.id),
          eq(socialPostTargetSetModel.workspaceId, input.workspaceId),
        ),
      )
      .returning(setColumns())

    return row ?? null
  },

  async delete(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .delete(socialPostTargetSetModel)
      .where(
        and(
          eq(socialPostTargetSetModel.id, input.id),
          eq(socialPostTargetSetModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: socialPostTargetSetModel.id })

    return rows.length > 0
  },

  /** The destinations of each set, in the order the set lists them. */
  async listDestinations(
    input: { targetSetIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    if (input.targetSetIds.length === 0) {
      return []
    }
    return await tx
      .select({
        destinationId: socialPostTargetSetDestinationModel.publishDestinationId,
        targetSetId: socialPostTargetSetDestinationModel.targetSetId,
      })
      .from(socialPostTargetSetDestinationModel)
      .where(
        and(
          eq(
            socialPostTargetSetDestinationModel.workspaceId,
            input.workspaceId,
          ),
          inArray(
            socialPostTargetSetDestinationModel.targetSetId,
            input.targetSetIds,
          ),
        ),
      )
      .orderBy(
        asc(socialPostTargetSetDestinationModel.targetSetId),
        asc(socialPostTargetSetDestinationModel.position),
      )
  },

  /**
   * Makes the set list exactly `destinationIds`, in that order. The set row is
   * locked first so two concurrent replacements run one after the other rather
   * than leaving the union of both selections.
   */
  async replaceDestinations(
    input: {
      destinationIds: string[]
      targetSetId: string
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<void> {
    const [targetSet] = await tx
      .select({ id: socialPostTargetSetModel.id })
      .from(socialPostTargetSetModel)
      .where(
        and(
          eq(socialPostTargetSetModel.id, input.targetSetId),
          eq(socialPostTargetSetModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
      .for("update")
    if (!targetSet) {
      throw new PublishDestinationWorkspaceError()
    }
    await tx
      .delete(socialPostTargetSetDestinationModel)
      .where(
        and(
          eq(
            socialPostTargetSetDestinationModel.workspaceId,
            input.workspaceId,
          ),
          eq(
            socialPostTargetSetDestinationModel.targetSetId,
            input.targetSetId,
          ),
        ),
      )
    if (input.destinationIds.length === 0) {
      return
    }
    await publishDestinationRepository.assertInWorkspace(
      { ids: input.destinationIds, workspaceId: input.workspaceId },
      tx,
    )
    await tx.insert(socialPostTargetSetDestinationModel).values(
      input.destinationIds.map((destinationId, position) => ({
        position,
        publishDestinationId: destinationId,
        targetSetId: input.targetSetId,
        workspaceId: input.workspaceId,
      })),
    )
  },
}
