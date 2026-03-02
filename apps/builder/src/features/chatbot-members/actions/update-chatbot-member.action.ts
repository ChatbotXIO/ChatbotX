"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { chatbotMemberModel } from "@aha.chat/database/schema"
import type {
  ChatbotMemberModel,
  ChatbotMemberPermissions,
} from "@aha.chat/database/types"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { BaseException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateChatbotMemberRequest } from "../schemas/chatbot-member.request"

export const updateChatbotMemberAction = chatbotActionClient
  .inputSchema(updateChatbotMemberRequest)
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id], parsedInput }) => {
    const chatbotMember = await findOrFail<ChatbotMemberModel>(
      chatbotMemberModel,
      { id, chatbotId },
      "Chatbot member not found",
    )

    const currentUserAndTargetChatbot =
      await getCurrentUserAndTargetChatbot(chatbotId)
    if (!currentUserAndTargetChatbot) {
      throw new BaseException(
        "You are not authorized to update this chatbot member",
      )
    }

    const permissions = currentUserAndTargetChatbot.targetChatbotMember
      .permissions as ChatbotMemberPermissions
    if (!permissions.superAdmin) {
      throw new BaseException(
        "You are not authorized to update this chatbot member. You need to be a super admin to do this.",
      )
    }

    await db
      .update(chatbotMemberModel)
      .set(parsedInput)
      .where(eq(chatbotMemberModel.id, chatbotMember.id))

    revalidateCacheTags(`chatbots:${chatbotId}#chatbotMembers`)
  })
