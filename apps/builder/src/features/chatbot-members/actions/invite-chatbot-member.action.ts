"use server"

import { prisma } from "@aha.chat/database"
import { init } from "@paralleldrive/cuid2"
import { addDays } from "date-fns"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { inviteChatbotMemberRequest } from "../schemas/chatbot-member.request"

export const inviteChatbotMemberAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(inviteChatbotMemberRequest)
  .action(
    async ({ ctx, parsedInput, bindArgsParsedInputs: [chatbotId] }) =>
      await prisma.invitation.create({
        data: {
          code: init({ length: 32 })(),
          permissions: parsedInput.permissions,
          expiresAt: addDays(new Date(), 1),
          chatbotId,
          organizationId: ctx.chatbot.organizationId,
          invitedBy: ctx.user.id,
        },
      }),
  )
