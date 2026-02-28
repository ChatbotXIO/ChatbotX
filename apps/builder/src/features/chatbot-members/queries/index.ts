"use server"

import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { chatbotMemberModel } from "@aha.chat/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { getPaginationWithDefaults } from "@/lib/pagination"
import type { GetChatbotMembersSchema } from "../schemas/get-chatbot-members.request"
import type {
  ChatbotMemberCollection,
  ChatbotMemberResource,
} from "../schemas/resource"

export async function getAgents(
  input: GetChatbotMembersSchema,
): Promise<ChatbotMemberCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const pagination = getPaginationWithDefaults(input)

  const where = {
    chatbotId: input.chatbotId,
    user: input.keyword
      ? {
          name: {
            ilike: `%${input.keyword.toLowerCase()}%`,
          },
        }
      : undefined,
  }

  const [data, totalRows] = await Promise.all([
    db.query.chatbotMemberModel.findMany({
      ...pagination,
      where,
      with: {
        user: true,
      },
    }),
    db.$count(
      chatbotMemberModel,
      relationsFilterToSQL(chatbotMemberModel, where),
    ),
  ])
  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data: data as ChatbotMemberResource[], pageCount }
}

export const getAllChatbotMembers = async (userId: string) => {
  const chatbotMembers = await db.query.chatbotMemberModel.findMany({
    where: {
      userId,
    },
    with: {
      chatbot: true,
    },
  })

  const chatbots = chatbotMembers.map((member) => member.chatbot)

  const chatbotIds = Array.from(new Set(chatbots.map((chatbot) => chatbot.id)))

  return {
    chatbotMembers: chatbotMembers as ChatbotMemberResource[],
    chatbots,
    chatbotIds,
  }
}
