"use server"

import { AIAssistantException } from "@/features/integrations/ai-assistants/schemas/error.schema"
import {
  type UpdateAIAssistantsBindSchema,
  type UpdateAIAssistantsSchema,
  updateAIAssistantsBindSchema,
  updateAIAssistantsSchema,
} from "@/features/integrations/ai-assistants/schemas/update.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const updateAIAssistantsAction = authActionClient
  .schema(updateAIAssistantsSchema)
  .bindArgsSchemas(updateAIAssistantsBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, assistantId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAIAssistantsSchema
      bindArgsParsedInputs: UpdateAIAssistantsBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAIAssistant = await prisma.aiAssistant.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
          id: {
            not: assistantId,
          },
        },
      })

      if (existingAIAssistant) {
        throw new AIAssistantException(
          `AI Assistant with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aiAssistant.update({
        where: {
          id: assistantId,
        },
        data: parsedInput,
      })

      revalidateTag(`${ctx.user.id}#aiAssistants`)

      return {
        successful: true,
      }
    },
  )
