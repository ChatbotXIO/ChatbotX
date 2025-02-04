"use server"
import {
  type DeleteAiAssistantsBindSchema,
  deleteAiAssistantsBindSchema,
} from "@/features/integrations/ai-assistants/schemas/delete.schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { User } from "@ahachat.ai/database"

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
