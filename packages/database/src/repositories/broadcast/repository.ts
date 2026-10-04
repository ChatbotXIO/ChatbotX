import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  ne,
  relationsFilterToSQL,
} from "../../client"
import {
  type BroadcastStatus,
  withBroadcastTargets,
} from "../../partials/broadcast"
import { broadcastModel, contactsOnBroadcastsModel } from "../../schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "../../utils"

const NUMERIC_RE = /^\d+$/

export type BroadcastListInput = {
  workspaceId: string
  name?: string | null
  /** The builder narrows this to its own `BroadcastFilterStatus` union. */
  status?: string | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
  channel?: string | null
  /** Inclusive bounds on the scheduled send time. */
  scheduledFrom?: Date | null
  scheduledTo?: Date | null
}

const buildScheduleWhere = (input: BroadcastListInput) => {
  if (!(input.scheduledFrom || input.scheduledTo)) {
    return
  }
  return {
    gte: input.scheduledFrom ?? undefined,
    lte: input.scheduledTo ?? undefined,
  }
}

const buildWhere = (input: BroadcastListInput) => ({
  workspaceId: input.workspaceId,
  name: input.name ? { ilike: likeContains(input.name) } : undefined,
  status: input.status ?? undefined,
  channel: input.channel ?? undefined,
  schedulesAt: buildScheduleWhere(input),
  deletedAt: { isNull: true as const },
})

export const broadcastRepository = {
  /**
   * Paginated broadcast list with the slim relations the list page shows,
   * including each target page (with its flow) that the "view" dialog reads
   * for a multi-page broadcast. The `with` literal stays inline for Drizzle's
   * type inference to survive into `BroadcastResourceWithRelations`.
   */
  async listWithRelations(input: BroadcastListInput, tx: DatabaseClient = db) {
    const where = buildWhere(input)
    const pagination = getPaginationWithDefaults(input)
    const requestedOrderBy = parseOrderByAsObject(broadcastModel, input)
    // An empty or unknown sort yields no ORDER BY, which makes paging unstable.
    const orderBy =
      Object.keys(requestedOrderBy).length > 0
        ? requestedOrderBy
        : { createdAt: "desc" as const }

    return await tx.query.broadcastModel.findMany({
      where,
      with: {
        flow: {
          columns: {
            id: true,
            name: true,
          },
        },
        integrationWhatsapp: {
          columns: {
            id: true,
            name: true,
          },
        },
        integrationMessenger: {
          columns: {
            id: true,
            name: true,
          },
        },
        ...withBroadcastTargets,
      },
      ...pagination,
      orderBy,
    })
  },

  async count(
    input: BroadcastListInput,
    tx: DatabaseClient = db,
  ): Promise<number> {
    const where = buildWhere(input)
    return await tx.$count(
      broadcastModel,
      relationsFilterToSQL(broadcastModel, where),
    )
  },

  async countActive(
    input: {
      workspaceId: string
      channel: string
      statuses: readonly BroadcastStatus[]
      excludeId?: string
    },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      broadcastModel,
      and(
        eq(broadcastModel.workspaceId, input.workspaceId),
        eq(broadcastModel.channel, input.channel),
        inArray(broadcastModel.status, [...input.statuses]),
        isNull(broadcastModel.deletedAt),
        input.excludeId === undefined
          ? undefined
          : ne(broadcastModel.id, input.excludeId),
      ),
    )
  },

  async listAudience(
    input: { broadcastId: string; limit: number; offset: number },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.contactsOnBroadcastsModel.findMany({
      where: { broadcastId: input.broadcastId },
      with: { contact: true },
      limit: input.limit,
      offset: input.offset,
    })
  },

  async countAudience(
    broadcastId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      contactsOnBroadcastsModel,
      eq(contactsOnBroadcastsModel.broadcastId, broadcastId),
    )
  },

  /** id-or-name lookup, scoped to a non-deleted broadcast in the workspace. */
  async findByIdOrName(
    input: { workspaceId: string; idOrName: string },
    tx: DatabaseClient = db,
  ) {
    const where = {
      ...(NUMERIC_RE.test(input.idOrName)
        ? { id: input.idOrName, workspaceId: input.workspaceId }
        : { name: input.idOrName, workspaceId: input.workspaceId }),
      deletedAt: { isNull: true as const },
    }

    return await tx.query.broadcastModel.findFirst({
      where,
      with: withBroadcastTargets,
    })
  },
}
