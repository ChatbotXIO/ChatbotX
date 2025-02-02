"use server"

import {
  type CreateAssistantBindSchema,
  type CreateAssistantSchema,
  type DeleteAssistantBindSchema,
  type UpdateAssistantBindSchema,
  type UpdateAssistantSchema,
  createAssistantBindSchema,
  createAssistantSchema,
  deleteAssistantBindSchema,
  updateAssistantBindSchema,
  updateAssistantSchema,
} from "@/features/integrations/open-ai/schemas/assistant.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { User } from "@ahachat.ai/database"

/**
 * Create
 */
export const createAssistantAction = authActionClient
  .schema(createAssistantSchema)
  .bindArgsSchemas(createAssistantBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, name],
    }: {
      ctx: { user: User }
      parsedInput: CreateAssistantSchema
      bindArgsParsedInputs: CreateAssistantBindSchema
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

export const updateAssistantAction = authActionClient
  .schema(updateAssistantSchema)
  .bindArgsSchemas(updateAssistantBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, agentId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAssistantSchema
      bindArgsParsedInputs: UpdateAssistantBindSchema
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
export const deleteAssistantAction = authActionClient
  .bindArgsSchemas(deleteAssistantBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteAssistantBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      return {
        successful: true,
      }
    },
  )
