"use server"

import {
  type CreateAiAssistantsBindSchema,
  type CreateAiAssistantsSchema,
  createAiAssistantsBindSchema,
  createAiAssistantsSchema,
} from "@/features/integrations/ai-assistants/schemas/create.schema"
import { AiAssistantException } from "@/features/integrations/ai-assistants/schemas/error.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const createAiAssistantsAction = authActionClient
  .schema(createAiAssistantsSchema)
  .bindArgsSchemas(createAiAssistantsBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, name],
    }: {
      ctx: { user: User }
      parsedInput: CreateAiAssistantsSchema
      bindArgsParsedInputs: CreateAiAssistantsBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiAssistant = await prisma.aiAssistant.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })

      if (existingAiAssistant) {
        throw new AiAssistantException(
          `Ai Assistant with the name "${parsedInput.name}" already exists.`,
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
