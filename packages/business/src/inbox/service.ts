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
  inboxStatuses,
} from "@chatbotx.io/database/partials"
import { inboxModel } from "@chatbotx.io/database/schema"
import type {
  InboxModel,
  InboxWithIntegrations,
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
    const where = {
      workspaceId: input.workspaceId,
      status: inboxStatuses.enum.connected,
    }

    const pagination = getPaginationWithDefaults(input)
    const [data, totalRows] = await Promise.all([
      db.query.inboxModel.findMany({
        ...pagination,
        where: {
          workspaceId: input.workspaceId,
          status: inboxStatuses.enum.connected,
        },
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

  async resolveBroadcastInboxIds(input: {
    workspaceId: string
    channels?: ChannelType[] | null
    integrationWhatsappId?: string | null
    integrationMessengerId?: string | null
  }): Promise<string[]> {
    if (input.integrationWhatsappId) {
      const integration = await db.query.integrationWhatsappModel.findFirst({
        where: {
          id: input.integrationWhatsappId,
          workspaceId: input.workspaceId,
        },
        columns: { inboxId: true },
      })

      return integration ? [integration.inboxId] : []
    }

    if (input.integrationMessengerId) {
      const integration = await db.query.integrationMessengerModel.findFirst({
        where: {
          id: input.integrationMessengerId,
          workspaceId: input.workspaceId,
        },
        columns: { inboxId: true },
      })

      return integration ? [integration.inboxId] : []
    }

    const channels = Array.from(new Set(input.channels ?? []))

    // No channel specified -> no audience. Only an explicit "omnichannel"
    // selection means "all inboxes"; a missing/unknown channel should target
    // nobody rather than silently blast every inbox.
    if (channels.length === 0) {
      return []
    }

    const isOmnichannel = channels.includes(channelTypes.enum.omnichannel)

    const where: {
      workspaceId: string
      channel?: ChannelType | { in: ChannelType[] }
    } = {
      workspaceId: input.workspaceId,
    }
    if (!isOmnichannel) {
      where.channel = channels.length === 1 ? channels[0] : { in: channels }
    }

    const inboxes = await db.query.inboxModel.findMany({
      where,
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
          .set({ status: inboxStatuses.enum.connected, name: data.name })
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
    tx?: DatabaseClient
  }): Promise<void> {
    const client = props.tx ?? db

    await client
      .update(inboxModel)
      .set({ status: inboxStatuses.enum.disconnected })
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
}
export const inboxService = new InboxService()
