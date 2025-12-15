"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateConversationAssignerRequest,
  updateConversationAssignerRequest,
} from "../schemas/update-conversation-assigner.schema"

export const updateConversationAssignerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateConversationAssignerRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateConversationAssignerRequest
    }) => {
      await prisma.$transaction(async (tx) => {
        await assertCurrentUserCanAccessChatbot(chatbotId)

        await tx.conversation.update({
          where: { id: parsedInput.conversationId },
          data: { assignedUserId: parsedInput.assignedUserId },
        })
      })
    },
  )
