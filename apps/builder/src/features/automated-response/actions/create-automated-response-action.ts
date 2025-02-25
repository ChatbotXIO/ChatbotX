"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import {
  type CreateAutomatedResponseBindSchema,
  type CreateAutomatedResponseSchema,
  createAutomatedResponseBindSchema,
  createAutomatedResponseSchema,
} from "../schemas/create-automated-responses-schema"

export const createAutomatedResponseAction = authActionClient
  .schema(createAutomatedResponseSchema)
  .bindArgsSchemas(createAutomatedResponseBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, flowId, folderId],
    }: {
      ctx: { user: User }
      parsedInput: CreateAutomatedResponseSchema
      bindArgsParsedInputs: CreateAutomatedResponseBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const data = {
        ...parsedInput,
        chatbotId,
        folderId,
        flowId,
        replies: JSON.stringify(parsedInput.replies),
        status: false,
      }

      await prisma.automatedResponse.create({
        data,
      })

      return {
        successful: true,
      }
    },
  )
