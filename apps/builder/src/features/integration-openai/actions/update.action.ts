"use server"

import { OpenAIException } from "@/features/integration-openai/schemas/errors.schema"
import {
  type UpdateOpenAIBindSchema,
  type UpdateOpenAISchema,
  updateOpenAIBindSchema,
  updateOpenAiSchema,
} from "@/features/integration-openai/schemas/update.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"

export const updateOpenAIAction = authActionClient
  .schema(updateOpenAiSchema)
  .bindArgsSchemas(updateOpenAIBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, integrationId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateOpenAISchema
      bindArgsParsedInputs: UpdateOpenAIBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingIntegration = await prisma.integrationOpenAI.findFirst({
        select: {
          id: true,
        },
        where: {
          chatbotId,
          id: {
            not: integrationId,
          },
        },
      })

      if (existingIntegration) {
        throw new OpenAIException("OpenAI already exists.")
      }

      await prisma.integrationOpenAI.update({
        where: {
          id: integrationId,
        },
        data: {
          temperature: Number(parsedInput.temperature),
          maxTokens: Number(parsedInput.maxTokens),
          prompt: parsedInput.prompt,
          model: parsedInput.model,
          aiAgentId: parsedInput.aiAgentId,
        },
      })

      return {
        successful: true,
      }
    },
  )
