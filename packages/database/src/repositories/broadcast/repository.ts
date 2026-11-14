import {
  and,
  type DatabaseClient,
  db,
  eq,
  exists,
  inArray,
  isNull,
  ne,
  or,
  relationsFilterToSQL,
} from "../../client"
import {
  type BroadcastScheduleType,
  type BroadcastStatus,
  broadcastStatuses,
  broadcastTargetModes,
  withBroadcastTargets,
} from "../../partials/broadcast"
import { channelTypes } from "../../partials/channel"
import {
  broadcastModel,
  broadcastTargetModel,
  contactsOnBroadcastsModel,
  integrationMessengerModel,
  integrationWhatsappModel,
} from "../../schema"
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
  /** `false` hides the runs spawned by a repeating broadcast. Defaults to showing them, so existing callers are unchanged. */
  includeRuns?: boolean | null
  /** `true` hides the templates of repeating broadcasts (they never send themselves). */
  excludeTemplates?: boolean | null
  /** Only the runs spawned by this repeating broadcast. */
  parentBroadcastId?: string | null
  schedulesType?: BroadcastScheduleType | null
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

// A template is `schedulesType = recurring` without an `occurrenceAt`; runs are
// recognised by `occurrenceAt`, which survives the template being purged.
const buildRecurrenceWhere = (input: BroadcastListInput) => ({
  occurrenceAt:
    input.includeRuns === false ? { isNull: true as const } : undefined,
  OR: input.excludeTemplates
    ? [
        { schedulesType: { ne: "recurring" } },
        { occurrenceAt: { isNotNull: true as const } },
      ]
    : undefined,
})

const buildWhere = (input: BroadcastListInput) => ({
  workspaceId: input.workspaceId,
  name: input.name ? { ilike: likeContains(input.name) } : undefined,
  status: input.status ?? undefined,
  channel: input.channel ?? undefined,
  schedulesAt: buildScheduleWhere(input),
  schedulesType: input.schedulesType ?? undefined,
  parentBroadcastId: input.parentBroadcastId ?? undefined,
  ...buildRecurrenceWhere(input),
  deletedAt: { isNull: true as const },
})

// The schedule summary and the parent name ride along with a broadcast so
// neither the list nor the detail needs a second query.
const withBroadcastRecurrence = {
  recurrence: {
    columns: {
      id: true,
      rule: true,
      nextRunAt: true,
      occurrenceCount: true,
      lastOccurrenceAt: true,
      pausedAt: true,
      endedAt: true,
    },
  },
  parent: { columns: { id: true, name: true } },
} as const

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
        statusInbox: { columns: { id: true, name: true } },
        ...withBroadcastTargets,
        ...withBroadcastRecurrence,
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

  /**
   * Ids of the `sending` broadcasts that send through `inboxId`, in one query.
   * `targets` mode matches a `BroadcastTarget` row. `channel` (legacy) mode
   * matches the broadcast's integration column, or — when both integration
   * columns are null — a whole-channel broadcast on the inbox's channel or an
   * omnichannel one (which reaches every channel). Adding a channel needs no
   * change here: whole-channel rows are matched on `channel` alone.
   */
  async listSendingIdsForInbox(
    input: { workspaceId: string; inboxId: string; channel: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; parentBroadcastId: string | null }[]> {
    const viaTarget = and(
      eq(broadcastModel.targetMode, broadcastTargetModes.enum.targets),
      exists(
        tx
          .select({ one: broadcastTargetModel.broadcastId })
          .from(broadcastTargetModel)
          .where(
            and(
              eq(broadcastTargetModel.broadcastId, broadcastModel.id),
              eq(broadcastTargetModel.inboxId, input.inboxId),
            ),
          ),
      ),
    )
    const viaIntegration = or(
      exists(
        tx
          .select({ one: integrationMessengerModel.id })
          .from(integrationMessengerModel)
          .where(
            and(
              eq(
                integrationMessengerModel.id,
                broadcastModel.integrationMessengerId,
              ),
              eq(integrationMessengerModel.inboxId, input.inboxId),
            ),
          ),
      ),
      exists(
        tx
          .select({ one: integrationWhatsappModel.id })
          .from(integrationWhatsappModel)
          .where(
            and(
              eq(
                integrationWhatsappModel.id,
                broadcastModel.integrationWhatsappId,
              ),
              eq(integrationWhatsappModel.inboxId, input.inboxId),
            ),
          ),
      ),
    )
    const wholeChannel = and(
      isNull(broadcastModel.integrationMessengerId),
      isNull(broadcastModel.integrationWhatsappId),
      inArray(broadcastModel.channel, [
        input.channel,
        channelTypes.enum.omnichannel,
      ]),
    )

    const rows = await tx
      .select({
        id: broadcastModel.id,
        parentBroadcastId: broadcastModel.parentBroadcastId,
      })
      .from(broadcastModel)
      .where(
        and(
          eq(broadcastModel.workspaceId, input.workspaceId),
          eq(broadcastModel.status, broadcastStatuses.enum.sending),
          isNull(broadcastModel.deletedAt),
          or(
            viaTarget,
            and(
              eq(broadcastModel.targetMode, broadcastTargetModes.enum.channel),
              or(viaIntegration, wholeChannel),
            ),
          ),
        ),
      )

    return rows
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
      with: {
        statusInbox: { columns: { id: true, name: true } },
        ...withBroadcastTargets,
        ...withBroadcastRecurrence,
      },
    })
  },
}
