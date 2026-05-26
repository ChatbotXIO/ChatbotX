import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "@chatbotx.io/database/client"
import { conversationModel, messageModel } from "@chatbotx.io/database/schema"
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

  // Conta mensagens INCOMING não lidas pelo agente (createdAt >
  // agentLastReadAt OR agentLastReadAt IS NULL), agrupadas por
  // conversationId. Usado pro badge azul de cada card na lista do Inbox
  // (igual Respond.io "8" no pill azul). Mora aqui no service pra
  // evitar quirk do Next 16 standalone que reclama de imports de Drizzle
  // models em arquivos "use server".
  async countUnreadByConversationIds(props: {
    tx?: DatabaseClient
    conversationIds: string[]
  }): Promise<Map<string, number>> {
    const { tx = db, conversationIds } = props
    if (conversationIds.length === 0) {
      return new Map()
    }
    const rows = await tx
      .select({
        conversationId: messageModel.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(messageModel)
      .innerJoin(
        conversationModel,
        eq(messageModel.conversationId, conversationModel.id),
      )
      .where(
        and(
          inArray(messageModel.conversationId, conversationIds),
          eq(messageModel.messageType, "incoming"),
          or(
            isNull(conversationModel.agentLastReadAt),
            gt(messageModel.createdAt, conversationModel.agentLastReadAt),
          ),
        ),
      )
      .groupBy(messageModel.conversationId)

    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.conversationId, row.count)
    }
    return map
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
