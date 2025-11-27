"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateChatbotMemberRequest } from "../schemas/chatbot-member.request"

export const updateChatbotMemberAction = chatbotActionClient
  .inputSchema(updateChatbotMemberRequest)
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id], parsedInput }) => {
    await prisma.chatbotMember.findFirstOrThrow({
      where: {
        chatbotId,
        id,
      },
    })

    await prisma.chatbotMember.update({
      where: {
        id,
      },
      data: parsedInput,
    })

    revalidateCacheTags(`chatbots:${chatbotId}#chatbotMembers`)
  })
