"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { User } from "@ahachat.ai/database"
import { createAgentSchema } from "../schemas/agents.schema"
import {
  type CreateAgentBindSchema,
  type CreateAgentSchema,
  createAgentBindSchema,
} from "../schemas/agents.schema"

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

      console.log(parsedInput, name)

      return {
        successful: true,
      }
    },
  )
