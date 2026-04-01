"use server"

import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { chatbotMemberModel } from "@chatbotx.io/database/schema"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetChatbotMembersSchema,
  ListChatbotMembersResponse,
} from "../schema/query"
import type { ChatbotMemberResource } from "../schema/resource"

export async function listChatbotMembers(
  input: GetChatbotMembersSchema,
): Promise<ListChatbotMembersResponse> {
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

  return { data, pageCount }
}

export const getAllChatbotMembers = async (userId: bigint) => {
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
