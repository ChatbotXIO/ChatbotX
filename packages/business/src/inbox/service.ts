import { db } from "@chatbotx.io/database/client"
import type { InboxModel } from "@chatbotx.io/database/types"
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
}
export const inboxService = new InboxService()
