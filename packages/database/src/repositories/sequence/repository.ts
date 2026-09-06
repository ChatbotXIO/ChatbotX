import { type DatabaseClient, db, eq, relationsFilterToSQL } from "../../client"
import { rootFolderId } from "../../partials"
import {
  contactsOnSequenceModel,
  sequenceModel,
  sequenceStepModel,
} from "../../schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "../../utils"

export type SequenceListInput = {
  workspaceId: string
  name?: string | null
  folderId?: string | null
  active?: boolean | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

const buildWhere = (input: SequenceListInput) => {
  let folderIdFilter: string | { isNull: true } | undefined
  if (input.folderId) {
    folderIdFilter =
      input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
  }

  return {
    workspaceId: input.workspaceId,
    folderId: folderIdFilter,
    name: input.name ? { ilike: likeContains(input.name) } : undefined,
    active:
      input.active !== undefined && input.active !== null
        ? input.active
        : undefined,
  }
}

export const sequenceRepository = {
  /**
   * Paginated sequences with per-row `stepsCount`/`subscribersCount`. The
   * `extras` closures reference `db.$count` directly, so they must stay
   * inside this method for Drizzle's type inference to survive into
   * `ListSequencesResponse`.
   */
  async listWithCounts(input: SequenceListInput, tx: DatabaseClient = db) {
    const where = buildWhere(input)
    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(sequenceModel, input)

    return await tx.query.sequenceModel.findMany({
      where,
      orderBy,
      ...pagination,
      extras: {
        stepsCount: (table) =>
          db.$count(
            sequenceStepModel,
            eq(sequenceStepModel.sequenceId, table.id),
          ),
        subscribersCount: (table) =>
          db.$count(
            contactsOnSequenceModel,
            eq(contactsOnSequenceModel.sequenceId, table.id),
          ),
      },
    })
  },

  async count(
    input: SequenceListInput,
    tx: DatabaseClient = db,
  ): Promise<number> {
    const where = buildWhere(input)
    return await tx.$count(
      sequenceModel,
      relationsFilterToSQL(sequenceModel, where),
    )
  },

  /** Sequence detail with ordered steps + each step's flow. */
  async findWithSteps(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.sequenceModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
      with: {
        sequenceSteps: {
          with: {
            flow: true,
          },
          orderBy: (step, { asc }) => [asc(step.order)],
        },
      },
    })
  },
}
