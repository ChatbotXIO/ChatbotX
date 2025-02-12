"use server"

import {
  type CreateAIAssistantsBindSchema,
  type CreateAIAssistantsSchema,
  createAIAssistantsBindSchema,
  createAIAssistantsSchema,
} from "@/features/integrations/ai-assistants/schemas/create.schema"
import { AIAssistantException } from "@/features/integrations/ai-assistants/schemas/error.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const createAIAssistantsAction = authActionClient
  .schema(createAIAssistantsSchema)
  .bindArgsSchemas(createAIAssistantsBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, name],
    }: {
      ctx: { user: User }
      parsedInput: CreateAIAssistantsSchema
      bindArgsParsedInputs: CreateAIAssistantsBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAIAssistant = await prisma.aiAssistant.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })

      if (existingAIAssistant) {
        throw new AIAssistantException(
          `AI Assistant with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aiAssistant.create({
        data: {
          chatbotId,
          prompt: "",
          model: "gpt-4o-mini",
          temperature: 1,
          ...parsedInput,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAssistants`)

      return {
        successful: true,
      }
    },
  )
