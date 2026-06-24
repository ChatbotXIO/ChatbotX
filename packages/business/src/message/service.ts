import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { type MessageType, messageTypes } from "@chatbotx.io/database/partials"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type { MessageModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

type FindByProps = {
  conversationId: string
  messageType?: MessageType
  workspaceId: string
}

class MessageService extends BaseService {
  protected readonly cachePrefix: string = "messages"

  async findByUncached(props: {
    tx?: DatabaseClient
    sinceTime: Date
    where: FindByProps
  }): Promise<MessageModel | undefined> {
    const { tx = db, where, sinceTime } = props
    const repo = await createMessageRepository(tx)

    const messages = await repo.findLastByConversation(where.conversationId, {
      messageTypes: where.messageType ? [where.messageType] : undefined,
      limit: 1,
      sinceTime,
      workspaceId: where.workspaceId,
    })
    return messages[0]
  }

  async findBy(props: {
    tx?: DatabaseClient
    sinceTime: Date
    where: FindByProps
    ttlInSeconds?: number
  }): Promise<MessageModel | undefined> {
    const cacheKey = `${this.cachePrefix}:${JSON.stringify(props.where)}`

    return await withCache(
      cacheKey,
      async () => await this.findByUncached(props),
      {
        dynamicTags: (result) => {
          if (result) {
            return [`tags:${this.cachePrefix}:${result.id}`]
          }
        },
        ttl: props.ttlInSeconds,
      },
    )
  }

  findLatestIncomingMessage(props: {
    conversationId: string
    sinceTime: Date
    workspaceId: string
  }): Promise<MessageModel | undefined> {
    return this.findBy({
      where: {
        conversationId: props.conversationId,
        messageType: messageTypes.enum.incoming,
        workspaceId: props.workspaceId,
      },
      sinceTime: props.sinceTime,
      ttlInSeconds: 2 * 60,
    })
  }

  listLastMessages(props: {
    tx?: DatabaseClient
    conversationId: string
    limit: number
    sinceTime: Date
    workspaceId: string
  }): Promise<MessageModel[]> {
    const { tx = db, conversationId, limit, sinceTime, workspaceId } = props
    return withCache(
      `messages:${workspaceId}:${conversationId}:latest:${limit}`,
      async () => {
        const repo = await createMessageRepository(tx)
        const messages = await repo.findLastByConversation(conversationId, {
          messageTypes: [
            messageTypes.enum.incoming,
            messageTypes.enum.outgoing,
          ],
          limit,
          sinceTime,
          workspaceId,
        })
        return [...messages].reverse()
      },
      {
        tags: [
          `conversations:${conversationId}`,
          `conversations:${conversationId}:messages`,
        ],
      },
    )
  }
}

export const messageService = new MessageService()
