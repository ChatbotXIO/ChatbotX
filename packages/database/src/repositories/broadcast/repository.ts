import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  relationsFilterToSQL,
  type SQL,
  sql,
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
import type { BroadcastModel } from "../../types"
import {
  getPaginationWithDefaults,
  isBigintId,
  likeContains,
  parseOrderByAsObject,
} from "../../utils"

const NUMERIC_RE = /^\d+$/

/** A broadcast a contact was a recipient of, with that contact's own delivery state. */
export type ContactBroadcastRow = {
  broadcastId: string
  name: string
  status: BroadcastModel["status"]
  channel: string
  schedulesAt: Date
  sent: boolean
  deliveredAt: Date | null
  seenAt: Date | null
  clickedAt: Date | null
  failedAt: Date | null
}

/** Keyset position in the newest-first list of a contact's broadcasts. */
export type ContactBroadcastCursor = { schedulesAt: Date; broadcastId: string }

/** The delivery state of one recipient row, read while its broadcast is locked. */
export type BroadcastRecipientAttributionState = {
  deliveredAt: Date | null
  failedAt: Date | null
}

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

// A broadcast of the legacy layout (`targetMode` "channel") names its flow and
// its page through these columns instead of through `targets`; the detail
// dialog reads them, so every read that feeds it must load them.
const withBroadcastLegacyPage = {
  flow: { columns: { id: true, name: true } },
  integrationWhatsapp: { columns: { id: true, name: true } },
  integrationMessenger: { columns: { id: true, name: true } },
} as const

/** A broadcast whose name contains `search`, or whose id is exactly `search`. */
const matchesBroadcastSearch = (search: string): SQL | undefined => {
  const byName = ilike(broadcastModel.name, likeContains(search))
  return isBigintId(search) ? or(byName, eq(broadcastModel.id, search)) : byName
}

/** The broadcasts after `cursor` in newest-first order: scheduled earlier, or at the same time with a lower id. */
const afterContactBroadcastCursor = (
  cursor: ContactBroadcastCursor,
): SQL | undefined =>
  or(
    lt(broadcastModel.schedulesAt, cursor.schedulesAt),
    and(
      eq(broadcastModel.schedulesAt, cursor.schedulesAt),
      lt(broadcastModel.id, cursor.broadcastId),
    ),
  )

export const broadcastRepository = {
  /**
   * Locks the broadcast `FOR SHARE` for the life of `tx` and reads the
   * contact's recipient row, so a contact-info capture can only be written
   * while the broadcast is still attributable. The share lock conflicts with
   * the `UPDATE` of move-to-draft / soft delete and with the hard `DELETE`,
   * yet two captures never block each other. Returns `null` when the
   * broadcast is not attributable: another workspace, soft-deleted, a draft,
   * not sending `flowId` (when given: the flow the contact was answering), or
   * the contact is not a recipient. Callers hold the workspace fence first.
   */
  async lockRecipientForAttribution(
    input: {
      broadcastId: string
      contactId: string
      flowId?: string
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<BroadcastRecipientAttributionState | null> {
    const sendsFlow = input.flowId
      ? sql`AND (
          b."flowId" = ${input.flowId}::bigint
          OR EXISTS (
            SELECT 1 FROM "BroadcastTarget" t
            WHERE t."broadcastId" = b."id" AND t."flowId" = ${input.flowId}::bigint
          )
        )`
      : sql``

    const locked = await tx.execute<Record<string, unknown>>(sql`
      SELECT b."id"
      FROM "Broadcast" b
      WHERE b."id" = ${input.broadcastId}::bigint
        AND b."workspaceId" = ${input.workspaceId}::bigint
        AND b."deletedAt" IS NULL
        AND b."status" <> ${broadcastStatuses.enum.draft}::"broadcastStatus"
        ${sendsFlow}
      FOR SHARE OF b
    `)
    if (locked.rows.length === 0) {
      return null
    }

    // node-postgres hands raw `execute` timestamps back as strings.
    const recipient = await tx.execute<{
      deliveredAt: string | null
      failedAt: string | null
    }>(sql`
      SELECT "deliveredAt", "failedAt"
      FROM "ContactOnBroadcast"
      WHERE "broadcastId" = ${input.broadcastId}::bigint
        AND "contactId" = ${input.contactId}::bigint
    `)

    const row = recipient.rows[0]
    if (!row) {
      return null
    }
    return {
      deliveredAt: row.deliveredAt ? new Date(row.deliveredAt) : null,
      failedAt: row.failedAt ? new Date(row.failedAt) : null,
    }
  },

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
        ...withBroadcastLegacyPage,
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

  /**
   * The broadcasts a contact was sent, newest first, keyset-paginated. Only
   * rows that left the preparation stage count: handed to the channel (`sent`)
   * or failed. Fetches one row past `limit` so the caller can tell whether
   * another page exists. Served by the `contactId` index of `ContactOnBroadcast`
   * (a contact has few recipient rows); the caller must already have checked
   * that the contact belongs to `workspaceId`.
   */
  async listForContact(
    input: {
      workspaceId: string
      contactId: string
      limit: number
      cursor?: ContactBroadcastCursor
      /** Part of the broadcast's name, or its exact id. */
      search?: string
    },
    tx: DatabaseClient = db,
  ): Promise<ContactBroadcastRow[]> {
    const searchCondition = input.search
      ? matchesBroadcastSearch(input.search)
      : undefined
    const cursorCondition = input.cursor
      ? afterContactBroadcastCursor(input.cursor)
      : undefined

    return await tx
      .select({
        broadcastId: broadcastModel.id,
        name: broadcastModel.name,
        status: broadcastModel.status,
        channel: broadcastModel.channel,
        schedulesAt: broadcastModel.schedulesAt,
        sent: contactsOnBroadcastsModel.sent,
        deliveredAt: contactsOnBroadcastsModel.deliveredAt,
        seenAt: contactsOnBroadcastsModel.seenAt,
        clickedAt: contactsOnBroadcastsModel.clickedAt,
        failedAt: contactsOnBroadcastsModel.failedAt,
      })
      .from(contactsOnBroadcastsModel)
      .innerJoin(
        broadcastModel,
        eq(broadcastModel.id, contactsOnBroadcastsModel.broadcastId),
      )
      .where(
        and(
          eq(contactsOnBroadcastsModel.contactId, input.contactId),
          eq(broadcastModel.workspaceId, input.workspaceId),
          isNull(broadcastModel.deletedAt),
          ne(broadcastModel.status, broadcastStatuses.enum.draft),
          or(
            eq(contactsOnBroadcastsModel.sent, true),
            isNotNull(contactsOnBroadcastsModel.failedAt),
          ),
          searchCondition,
          cursorCondition,
        ),
      )
      .orderBy(desc(broadcastModel.schedulesAt), desc(broadcastModel.id))
      .limit(input.limit + 1)
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
        ...withBroadcastLegacyPage,
        statusInbox: { columns: { id: true, name: true } },
        ...withBroadcastTargets,
        ...withBroadcastRecurrence,
      },
    })
  },
}
