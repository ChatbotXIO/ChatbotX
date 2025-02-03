"use server"

import {
  type CreateAiAssistantsBindSchema,
  type CreateAiAssistantsSchema,
  type DeleteAiAssistantsBindSchema,
  type UpdateAiAssistantsBindSchema,
  type UpdateAiAssistantsSchema,
  createAiAssistantsBindSchema,
  createAiAssistantsSchema,
  deleteAiAssistantsBindSchema,
  updateAiAssistantsBindSchema,
  updateAiAssistantsSchema,
} from "@/features/integrations/open-ai/schemas/ai-assistants.schema"
import { AiAssistantException } from "@/features/integrations/open-ai/schemas/error"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

/**
 * Create
 */
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
          ...parsedInput,
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAssistants`)

      return {
        successful: true,
      }
    },
  )

/**
 * Update
 */

export const updateAiAssistantsAction = authActionClient
  .schema(updateAiAssistantsSchema)
  .bindArgsSchemas(updateAiAssistantsBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, agentId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAiAssistantsSchema
      bindArgsParsedInputs: UpdateAiAssistantsBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      return {
        successful: true,
      }
    },
  )

/**
 * Delete
 */
export const deleteAiAssistantsAction = authActionClient
  .bindArgsSchemas(deleteAiAssistantsBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAiAssistantsBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      return {
        successful: true,
      }
    },
  )
