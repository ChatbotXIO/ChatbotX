import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import { inboxModel } from "@chatbotx.io/database/schema"
import type {
  InboxModel,
  InboxWithIntegrations,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { userQuotaService } from "../user-quota/service"

type InboxWhere = Partial<{ id: string; workspaceId: string }>

class InboxService extends BaseService {
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
      with: {
        integrationInstagram: true,
        integrationMessenger: true,
        integrationTelegram: true,
        integrationWebchat: true,
        integrationWhatsapp: true,
        integrationZalo: true,
        integrationSmtp: true,
      },
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
