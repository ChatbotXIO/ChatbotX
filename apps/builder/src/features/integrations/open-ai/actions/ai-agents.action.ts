"use server"

import { AiAgentException } from "@/features/integrations/open-ai/schemas/error"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type CreateAiAgentBindSchema,
  type CreateAiAgentSchema,
  type DeleteAiAgentBindSchema,
  type UpdateAiAgentBindSchema,
  type UpdateAiAgentSchema,
  createAiAgentBindSchema,
  createAiAgentSchema,
  deleteAiAgentBindSchema,
  updateAiAgentBindSchema,
  updateAiAgentSchema,
} from "../schemas/ai-agents.schema"

/**
 * Create
 */
export const createAiAgentAction = authActionClient
  .schema(createAiAgentSchema)
  .bindArgsSchemas(createAiAgentBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, name],
    }: {
      ctx: { user: User }
      parsedInput: CreateAiAgentSchema
      bindArgsParsedInputs: CreateAiAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiAgent = await prisma.aiAgent.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })

      if (existingAiAgent) {
        throw new AiAgentException(
          `AiAgent with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aiAgent.create({
        data: {
          ...parsedInput,
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAgents`)

      return {
        successful: true,
      }
    },
  )

/**
 * Update
 */
export const updateAiAgentAction = authActionClient
  .schema(updateAiAgentSchema)
  .bindArgsSchemas(updateAiAgentBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, agentId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAiAgentSchema
      bindArgsParsedInputs: UpdateAiAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingAiAgent = await prisma.aiAgent.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
          id: {
            not: agentId,
          },
        },
      })

      if (existingAiAgent) {
        throw new AiAgentException(
          `AiAgent with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.aiAgent.update({
        where: {
          id: agentId,
        },
        data: {
          name: parsedInput.name,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAgents`)

      return {
        successful: true,
      }
    },
  )

/**
 * Delete
 */
export const deleteAiAgentAction = authActionClient
  .bindArgsSchemas(deleteAiAgentBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAiAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await prisma.aiAgent.deleteMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
      })

      revalidateTag(`${ctx.user.id}#aiAgents`)

      return {
        successful: true,
      }
    },
  )
