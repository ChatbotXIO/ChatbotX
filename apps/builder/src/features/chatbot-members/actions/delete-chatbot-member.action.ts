"use server"

import { ChatbotMemberRole, prisma } from "@aha.chat/database"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { BaseException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteChatbotMemberAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ ctx, bindArgsParsedInputs }) => {
    const [chatbotId, id] = bindArgsParsedInputs
    const chatbotMember = await prisma.chatbotMember.findFirstOrThrow({
      where: { id, chatbotId },
    })
    if (chatbotMember.userId === ctx.user.id) {
      throw new BaseException("You cannot delete yourself from the chatbot")
    }
    if (chatbotMember.role === ChatbotMemberRole.owner) {
      throw new BaseException("You cannot delete the owner of the chatbot")
    }

    await prisma.chatbotMember.delete({
      where: { id, chatbotId },
    })

    revalidateCacheTags(`chatbots:${chatbotId}#chatbotMembers`)
  })
