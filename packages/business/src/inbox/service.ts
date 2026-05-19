import { db } from "@chatbotx.io/database/client"
import type {
  InboxModel,
  InboxWithIntegrations,
} from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"

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
}
export const inboxService = new InboxService()
