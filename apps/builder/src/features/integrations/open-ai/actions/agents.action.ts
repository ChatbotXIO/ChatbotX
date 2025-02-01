"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { User } from "@ahachat.ai/database"
import { createAgentSchema } from "../schemas/agents.schema"
import {
  type CreateAgentBindSchema,
  type CreateAgentSchema,
  type DeleteAgentBindSchema,
  type UpdateAgentBindSchema,
  type UpdateAgentSchema,
  createAgentBindSchema,
  deleteAgentBindSchema,
  updateAgentBindSchema,
  updateAgentSchema,
} from "../schemas/agents.schema"

/**
 * Create
 */
export const createAgentAction = authActionClient
  .schema(createAgentSchema)
  .bindArgsSchemas(createAgentBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, name],
    }: {
      ctx: { user: User }
      parsedInput: CreateAgentSchema
      bindArgsParsedInputs: CreateAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      return {
        successful: true,
      }
    },
  )

/**
 * Update
 */
export const updateAgentAction = authActionClient
  .schema(updateAgentSchema)
  .bindArgsSchemas(updateAgentBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, agentId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAgentSchema
      bindArgsParsedInputs: UpdateAgentBindSchema
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
export const deleteAgentAction = authActionClient
  .bindArgsSchemas(deleteAgentBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAgentBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      return {
        successful: true,
      }
    },
  )
