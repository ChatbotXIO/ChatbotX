import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { type MessageType, messageTypes } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  type MessageWithAttachments,
} from "@chatbotx.io/database/repositories"
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
    let messageTypesFilter: MessageType[] | undefined
    if (where.messageType) {
      messageTypesFilter = [where.messageType]
    }

    const messages = await repo.findLastByConversation(where.conversationId, {
      messageTypes: messageTypesFilter,
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

  async findLatestIncomingMessageWithAttachments(props: {
    tx?: DatabaseClient
    conversationId: string
    sinceTime: Date
    workspaceId: string
  }): Promise<MessageWithAttachments | undefined> {
    const { tx = db, conversationId, sinceTime, workspaceId } = props
    const repo = await createMessageRepository(tx)
    const messages = await repo.findLastByConversation(conversationId, {
      messageTypes: [messageTypes.enum.incoming],
      limit: 1,
      requireCompleteResults: true,
      sinceTime,
      withAttachments: true,
      workspaceId,
    })
    return messages[0]
  }

  async findById(props: {
    tx?: DatabaseClient
    id: string
    createdAt: Date
    workspaceId: string
  }): Promise<MessageModel | null> {
    const { tx = db, id, createdAt, workspaceId } = props
    const repo = await createMessageRepository(tx)
    return await repo.findById({
      id,
      createdAt,
      workspaceId,
    })
  }

  async listLastMessages(props: {
    tx?: DatabaseClient
    conversationId: string
    limit: number
    sinceTime: Date
    workspaceId: string
  }): Promise<MessageModel[]> {
    const { tx = db, conversationId, limit, sinceTime, workspaceId } = props
    const repo = await createMessageRepository(tx)
    const messages = await repo.findLastByConversation(conversationId, {
      messageTypes: [messageTypes.enum.incoming, messageTypes.enum.outgoing],
      limit,
      sinceTime,
      workspaceId,
    })
    return [...messages].reverse()
  }

  async listIncomingTextsByContactInbox(props: {
    tx?: DatabaseClient
    contactInboxId: string
    limit?: number
    sinceTime: Date
    workspaceId: string
  }): Promise<string[]> {
    const { tx = db, ...params } = props
    const repo = await createMessageRepository(tx)
    return await repo.listIncomingTextsByContactInbox(params)
  }

  async hardDeleteAllByContactInbox(props: {
    tx?: DatabaseClient
    contactInboxId: string
    sinceTime: Date
    workspaceId: string
  }): Promise<{ attachmentPaths: string[] }> {
    const { tx = db, ...params } = props
    const repo = await createMessageRepository(tx)
    return await repo.hardDeleteAllByContactInbox(params)
  }
}

export const messageService = new MessageService()
