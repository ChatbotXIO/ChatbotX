"use server"

import {
  type UpdateAiAssistantsSchema,
  type UpdateAiAssistantsBindSchema,
  updateAiAssistantsSchema,
  updateAiAssistantsBindSchema,
} from "@/features/integrations/ai-assistants/schemas/update.schema"
import { authActionClient } from "@/lib/safe-action"
import type { User } from "@ahachat.ai/database"
import { findChatbotOrFail } from "@/lib/user-permissions"

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
