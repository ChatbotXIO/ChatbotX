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

export const deleteChatbotMemberAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ ctx, bindArgsParsedInputs }) => {
    const [chatbotId, id] = bindArgsParsedInputs
    const chatbotMember = await findOrFail<ChatbotMemberModel>(
      chatbotMemberModel,
      { id, chatbotId },
      "Chatbot member not found",
    )
    if (chatbotMember.userId === ctx.user.id) {
      throw new BaseException("You cannot delete yourself from the chatbot")
    }
    if (chatbotMember.role === "owner") {
      throw new BaseException("You cannot delete the owner of the chatbot")
    }

    const currentUserAndTargetChatbot =
      await getCurrentUserAndTargetChatbot(chatbotId)
    if (!currentUserAndTargetChatbot) {
      throw new BaseException(
        "You are not authorized to delete this chatbot member",
      )
    }

    const permissions = currentUserAndTargetChatbot.targetChatbotMember
      .permissions as ChatbotMemberPermissions
    if (!permissions.superAdmin) {
      throw new BaseException(
        "You are not authorized to delete this chatbot member. You need to be a super admin to do this.",
      )
    }

    await db.delete(chatbotMemberModel).where(eq(chatbotMemberModel.id, id))

    revalidateCacheTags(`chatbots:${chatbotId}#chatbotMembers`)
  })
