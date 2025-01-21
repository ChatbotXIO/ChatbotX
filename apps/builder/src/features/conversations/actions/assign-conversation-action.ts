"use server"

import {
  type ChatbotBindSchema,
  chatbotBindSchema,
} from "@/features/chatbots/schemas/handle-resource-schema"
import {
  type AssignConversationSchema,
  assignConversationSchema,
} from "@/features/conversations/schemas/assign-conversation-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { assignConversationService } from "@/services/conversation.service"
import {
  type AssignedType,
  type Team,
  type User,
  prisma,
} from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export interface AssignConversationResponse {
  assigner: User | Team | null
  assignedType: AssignedType | null
  assignedId: string | null
}

export const assignConversationAction = authActionClient
  .schema(assignConversationSchema)
  .bindArgsSchemas(chatbotBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: AssignConversationSchema
      bindArgsParsedInputs: ChatbotBindSchema
    }): Promise<AssignConversationResponse> => {
      await findChatbotOrFail(ctx.user.id, chatbotId)
      const params = {
        chatbotId: chatbotId,
        id: {
          in: parsedInput.ids,
        },
      }

      const contacts = await prisma.contact.findMany({
        where: params,
      })
      if (contacts.length !== parsedInput.ids.length) {
        throw new Error(
          "Contact not exists on chatbot or conversation archived before.",
        )
      }

      const data = await assignConversationService(
        contacts,
        parsedInput.assignedId,
        parsedInput.assignedType,
      )
      revalidateTag(`${ctx.user.id}#contacts`)

      return data
    },
  )
