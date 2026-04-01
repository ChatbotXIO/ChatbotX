"use server"

import { db } from "@chatbotx.io/database/client"
import { invitationModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { addDays } from "date-fns"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { inviteChatbotMemberRequest } from "../schema/mutation"

export const inviteChatbotMemberAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(inviteChatbotMemberRequest)
  .action(
    async ({ ctx, parsedInput, bindArgsParsedInputs: [chatbotId] }) =>
      await db
        .insert(invitationModel)
        .values({
          id: createId(),
          code: createId().toString(),
          permissions: parsedInput.permissions,
          expiresAt: addDays(new Date(), 1),
          chatbotId,
          organizationId: ctx.chatbot.organizationId,
          invitedBy: ctx.user.id,
        })
        .returning()
        .then((result) => result[0]),
  )
