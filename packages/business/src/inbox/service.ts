import {
  and,
  type DatabaseClient,
  db,
  eq,
  ne,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import {
  type ChannelType,
  channelTypes,
  type InboxDisconnectReason,
  inboxStatuses,
} from "@chatbotx.io/database/partials"
import { inboxModel } from "@chatbotx.io/database/schema"
import type {
  InboxModel,
  InboxWithIntegrations,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { channelLimitReachedException } from "../errors"
import { logger } from "../logger"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceUsageService } from "../workspace-usage/service"
import type { ListInboxesRequest, ListInboxesResponse } from "./schema"

type InboxWhere = Partial<{ id: string; workspaceId: string }>

export type BroadcastInboxResolutionInput = {
  workspaceId: string
  channels?: ChannelType[] | null
  /**
   * Explicit target inboxes of a multi-page broadcast; wins over the legacy
   * integration ids whenever it is given. An empty list is a real scope
   * (every page is gone — nobody), not "not applicable".
   */
  inboxIds?: string[] | null
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
}

/** Returns the resolved inbox ids, or `null` when the strategy does not apply to the input. */
type BroadcastInboxStrategy = (
  input: BroadcastInboxResolutionInput,
) => Promise<string[] | null>

class InboxService extends BaseService {
  static readonly withIntegrations = {
    integrationWhatsapp: true,
    integrationWebchat: true,
    integrationMessenger: true,
    integrationInstagram: true,
    integrationZalo: true,
    integrationTelegram: true,
    integrationSmtp: true,
    integrationTiktok: true,
  }

  async list(input: ListInboxesRequest): Promise<ListInboxesResponse> {
    // One `where`, shared by the page query and the count, so the two can
    // never drift (they previously repeated the same literal side by side).
    const where = {
      workspaceId: input.workspaceId,
      status: inboxStatuses.enum.connected,
    }

    const pagination = getPaginationWithDefaults(input)
    const [data, totalRows] = await Promise.all([
      db.query.inboxModel.findMany({
        ...pagination,
        where,
        with: input.includes?.includes("integration")
          ? InboxService.withIntegrations
          : undefined,
      }),
      db.$count(inboxModel, relationsFilterToSQL(inboxModel, where)),
    ])

    const limit = input.perPage ?? 10
    const pageCount = Math.ceil(totalRows / limit)

    return { data, pageCount }
  }

  async listWithIntegrationsByWorkspace(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<InboxWithIntegrations[]> {
    return await tx.query.inboxModel.findMany({
      where: {
        workspaceId,
      },
      with: InboxService.withIntegrations,
    })
  }

  async find(props: { where: InboxWhere }): Promise<InboxModel | undefined> {
    const { where } = props
    // return await withCache(
    //   `inbox:${JSON.stringify(props.where)}`,
    //   async () =>
    return await db.query.inboxModel.findFirst({
      where,
    })
    //   {
    //     tags: ["inboxes"],
    //   },
    // )
  }

  /**
   * Workspace-scoped generalization of `findWithIntegrationsById` — callers
   * that already have a `workspaceId` (e.g. `ContactScanService`) should
   * prefer this so a forged/foreign `id` can never resolve into another
   * tenant's inbox. `findWithIntegrationsById` stays for its existing
   * unscoped callers.
   */
  async findWithIntegrations(props: {
    where: InboxWhere
  }): Promise<InboxWithIntegrations | undefined> {
    return await db.query.inboxModel.findFirst({
      where: props.where,
      with: InboxService.withIntegrations,
    })
  }

  async findWithIntegrationsById(props: {
    id: string
  }): Promise<InboxWithIntegrations | undefined> {
    return await db.query.inboxModel.findFirst({
      where: { id: props.id },
      with: InboxService.withIntegrations,
    })
  }

  /**
   * Distinct channel types the workspace has a connected inbox for. Used to
   * grandfather already-connected channels back into the settings accordion
   * even when a platform admin / white-label owner has since hidden that
   * channel from *new* creation — hiding must never make an existing
   * connection disappear from the UI.
   */
  async distinctConnectedChannels(workspaceId: string): Promise<ChannelType[]> {
    const rows = await db
      .selectDistinct({ channel: inboxModel.channel })
      .from(inboxModel)
      .where(
        and(
          eq(inboxModel.workspaceId, workspaceId),
          eq(inboxModel.status, inboxStatuses.enum.connected),
        ),
      )
    return rows
      .map((row) => row.channel)
      .filter((channel): channel is ChannelType =>
        channelTypes.options.includes(channel as ChannelType),
      )
  }

  /**
   * Inbox ids a broadcast audience is scoped to. Strategies run in priority
   * order and the first applicable one wins: explicit target inboxes (multi-
   * page broadcasts), then the legacy single-integration columns, then the
   * channel list. Each strategy returns `null` when its input is absent so the
   * next one is consulted.
   */
  private readonly broadcastInboxStrategies: readonly BroadcastInboxStrategy[] =
    [
      (input) => this.resolveExplicitBroadcastInboxIds(input),
      (input) =>
        this.resolveIntegrationInboxId(
          input.workspaceId,
          input.integrationWhatsappId,
          (where) =>
            db.query.integrationWhatsappModel.findFirst({
              where,
              columns: { inboxId: true },
            }),
        ),
      (input) =>
        this.resolveIntegrationInboxId(
          input.workspaceId,
          input.integrationMessengerId,
          (where) =>
            db.query.integrationMessengerModel.findFirst({
              where,
              columns: { inboxId: true },
            }),
        ),
      (input) => this.resolveChannelBroadcastInboxIds(input),
    ]

  async resolveBroadcastInboxIds(
    input: BroadcastInboxResolutionInput,
  ): Promise<string[]> {
    for (const strategy of this.broadcastInboxStrategies) {
      const inboxIds = await strategy(input)
      if (inboxIds) {
        return inboxIds
      }
    }
    return []
  }

  /**
   * Only the `channel` narrowing of an inbox lookup. An explicit
   * "omnichannel" selection means every inbox; no channel at all means the
   * caller decides (a channel-driven audience targets nobody, an explicit
   * inbox list is simply not narrowed).
   */
  private buildBroadcastChannelWhere(
    channels: ChannelType[] | null | undefined,
  ): { channel?: ChannelType | { in: ChannelType[] } } {
    const distinct = Array.from(new Set(channels ?? []))
    if (
      distinct.length === 0 ||
      distinct.includes(channelTypes.enum.omnichannel)
    ) {
      return {}
    }
    return {
      channel: distinct.length === 1 ? distinct[0] : { in: distinct },
    }
  }

  // Foreign or cross-channel ids are dropped rather than rejected: the
  // audience simply excludes them, and the write path validates ownership
  // up front (`broadcastService.assertBroadcastTargetsOwned`).
  private async resolveExplicitBroadcastInboxIds(
    input: BroadcastInboxResolutionInput,
  ): Promise<string[] | null> {
    const { inboxIds } = input
    if (!inboxIds) {
      return null
    }
    if (inboxIds.length === 0) {
      return []
    }

    const inboxes = await db.query.inboxModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: { in: inboxIds },
        ...this.buildBroadcastChannelWhere(input.channels),
      },
      columns: { id: true },
    })
    return inboxes.map((inbox) => inbox.id)
  }

  /** Legacy single-integration columns: the integration's own inbox, or nobody when it is not the workspace's. */
  private async resolveIntegrationInboxId(
    workspaceId: string,
    integrationId: string | null | undefined,
    findIntegration: (where: {
      id: string
      workspaceId: string
    }) => Promise<{ inboxId: string } | undefined>,
  ): Promise<string[] | null> {
    if (!integrationId) {
      return null
    }
    const integration = await findIntegration({
      id: integrationId,
      workspaceId,
    })
    return integration ? [integration.inboxId] : []
  }

  private async resolveChannelBroadcastInboxIds(
    input: BroadcastInboxResolutionInput,
  ): Promise<string[] | null> {
    // No channel specified -> no audience. Only an explicit "omnichannel"
    // selection means "all inboxes"; a missing/unknown channel should target
    // nobody rather than silently blast every inbox.
    if ((input.channels ?? []).length === 0) {
      return []
    }

    const inboxes = await db.query.inboxModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...this.buildBroadcastChannelWhere(input.channels),
      },
      columns: { id: true },
    })
    return inboxes.map((inbox) => inbox.id)
  }

  async create(props: {
    data: Omit<typeof inboxModel.$inferInsert, "id"> & { id?: string }
    ownerId: string
    tx?: DatabaseClient
  }): Promise<{ inbox: InboxModel; wasCreated: boolean }> {
    const { data, ownerId, tx = db } = props

    const existing = await tx.query.inboxModel.findFirst({
      where: {
        workspaceId: data.workspaceId,
        channel: data.channel,
        ...(data.sourceId ? { sourceId: data.sourceId } : {}),
      },
    })

    if (existing) {
      if (existing.status === inboxStatuses.enum.disconnected) {
        const [updated] = await tx
          .update(inboxModel)
          .set({
            status: inboxStatuses.enum.connected,
            name: data.name,
            disconnectedAt: null,
            disconnectReason: null,
          })
          .where(eq(inboxModel.id, existing.id))
          .returning()
        return { inbox: updated, wasCreated: true }
      }
      return { inbox: existing, wasCreated: false }
    }

    const consumed = await quotaEnforcementService.tryConsume({
      userId: ownerId,
      metric: "channels",
    })
    if (!consumed.ok) {
      throw channelLimitReachedException()
    }

    const [inbox] = await tx
      .insert(inboxModel)
      .values({ id: data.id ?? createId(), ...data })
      .returning()

    await workspaceUsageService
      .increment(data.workspaceId, "channels")
      .catch((err) => {
        logger.warn(
          { err, workspaceId: data.workspaceId },
          "workspace usage channel increment failed",
        )
      })

    return { inbox, wasCreated: true }
  }

  async disconnect(props: {
    inboxId: string
    ownerId: string
    workspaceId: string
    reason: InboxDisconnectReason
    tx?: DatabaseClient
  }): Promise<void> {
    const client = props.tx ?? db

    await client
      .update(inboxModel)
      .set({
        status: inboxStatuses.enum.disconnected,
        disconnectedAt: new Date(),
        disconnectReason: props.reason,
      })
      .where(eq(inboxModel.id, props.inboxId))

    // Best-effort: never block/roll back the disconnect if release fails, the
    // nightly reconcile self-heals.
    await quotaEnforcementService
      .release({ userId: props.ownerId, metric: "channels" })
      .catch((err) => {
        logger.warn(
          { err, inboxId: props.inboxId, ownerId: props.ownerId },
          "inbox disconnect: channel quota release failed",
        )
      })

    // Display-only breakdown, mirroring the `contacts` release. Never let a
    // failure here affect the authoritative counter released above.
    await workspaceUsageService
      .decrement(props.workspaceId, "channels")
      .catch((err) => {
        logger.warn(
          { err, inboxId: props.inboxId, workspaceId: props.workspaceId },
          "inbox disconnect: workspace usage channel decrement failed",
        )
      })
  }

  async isConnected(props: {
    channel: string
    sourceId: string
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const client = props.tx ?? db
    const [row] = await client
      .select({ id: inboxModel.id })
      .from(inboxModel)
      .where(
        and(
          eq(inboxModel.channel, props.channel),
          eq(inboxModel.sourceId, props.sourceId),
          ne(inboxModel.workspaceId, props.workspaceId),
          eq(inboxModel.status, inboxStatuses.enum.connected),
        ),
      )
      .limit(1)
    return !!row
  }

  /**
   * Inbox + `integrationMessenger` relation, with an explicit return type so
   * the relation survives inference (a bare `typeof db.query.inboxModel
   * .findFirst` with no call resolves to the no-`with` overload and drops
   * the relation — see `messenger-template-handler.ts`'s prior local
   * workaround). Unscoped by `id` only — safe today because its sole caller
   * (`messenger-template-handler.ts`) receives `inboxId` from a
   * webhook-resolved, already workspace-scoped context and has no
   * `workspaceId` in scope to filter by.
   */
  async findWithIntegrationMessengerByIdUnscoped(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<
    | (InboxModel & { integrationMessenger: IntegrationMessengerModel | null })
    | undefined
  > {
    const { id, tx = db } = props
    return await tx.query.inboxModel.findFirst({
      where: { id },
      with: { integrationMessenger: true },
    })
  }

  /**
   * Inbox + `integrationWhatsapp` relation — same explicit-return-type
   * reasoning as above. Unscoped by `id` only — safe today because its sole
   * caller (`wa-template-handler.ts`) receives `inboxId` from a
   * webhook-resolved, already workspace-scoped context and has no
   * `workspaceId` in scope to filter by.
   */
  async findWithIntegrationWhatsappByIdUnscoped(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<
    | (InboxModel & { integrationWhatsapp: IntegrationWhatsappModel | null })
    | undefined
  > {
    const { id, tx = db } = props
    return await tx.query.inboxModel.findFirst({
      where: { id },
      with: { integrationWhatsapp: true },
    })
  }

  /** `trigger/services/action-executor.ts` assignConversation: an inbox team by id, workspace-scoped. */
  async findTeamById(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }) {
    const { tx = db, workspaceId, id } = props
    return await tx.query.inboxTeamModel.findFirst({
      where: { id, workspaceId },
    })
  }
}
export const inboxService = new InboxService()
