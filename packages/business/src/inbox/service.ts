import {
  type DatabaseClient,
  db,
  eq,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import { inboxModel } from "@chatbotx.io/database/schema"
import type {
  InboxModel,
  InboxWithIntegrations,
} from "@chatbotx.io/database/types"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { userQuotaService } from "../user-quota/service"
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
          .set({ status: inboxStatuses.enum.connected })
          .where(eq(inboxModel.id, existing.id))
          .returning()
        return { inbox: updated, wasCreated: false }
      }
      return { inbox: existing, wasCreated: false }
    }

    const allowed = await userQuotaService.tryIncrement(ownerId, "channels")
    if (!allowed) {
      throw new Error("Channel limit reached for this plan")
    }

    const [inbox] = await tx
      .insert(inboxModel)
      .values({ id: data.id ?? createId(), ...data })
      .returning()

    return { inbox, wasCreated: true }
  }
}
export const inboxService = new InboxService()
