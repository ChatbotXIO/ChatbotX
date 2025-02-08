"use server"

import { AiAssistantException } from "@/features/integrations/ai-assistants/schemas/error.schema"
import {
  type UpdateAiAssistantsBindSchema,
  type UpdateAiAssistantsSchema,
  updateAiAssistantsBindSchema,
  updateAiAssistantsSchema,
} from "@/features/integrations/ai-assistants/schemas/update.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const updateAiAssistantsAction = authActionClient
  .schema(updateAiAssistantsSchema)
  .bindArgsSchemas(updateAiAssistantsBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, assistantId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAiAssistantsSchema
      bindArgsParsedInputs: UpdateAiAssistantsBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiAssistant = await prisma.aiAssistant.findFirst({
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

      if (existingAiAssistant) {
        throw new AiAssistantException(
          `Ai Assistant with the name "${parsedInput.name}" already exists.`,
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
