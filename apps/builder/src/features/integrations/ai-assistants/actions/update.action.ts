"use server"

import {
  type UpdateAiAssistantsBindSchema,
  type UpdateAiAssistantsSchema,
  updateAiAssistantsBindSchema,
  updateAiAssistantsSchema,
} from "@/features/integrations/ai-assistants/schemas/update.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { User } from "@ahachat.ai/database"

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
