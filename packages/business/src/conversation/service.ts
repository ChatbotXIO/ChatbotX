import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { ConversationModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

type FindByProps = {
  id: string
  contactId: string
  workspaceId: string
}

class ConversationService extends BaseService {
  protected readonly cachePrefix: string = "conversations"

  async findByUncached(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ConversationModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.conversationModel.findFirst({
      where,
    })
  }

  async findBy(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ConversationModel | undefined> {
    const cacheKey = `${this.cachePrefix}:${JSON.stringify(props.where)}`

    return await withCache(
      cacheKey,
      async () => await this.findByUncached(props),
      {
        dynamicTags: (result) => {
          if (result) {
            return [`${this.cachePrefix}:${result.id}`]
          }
        },
      },
    )
  }
}

export const conversationService = new ConversationService()
