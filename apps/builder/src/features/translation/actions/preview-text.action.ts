"use server"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { assertConversationAccessForCaller } from "@/lib/public-api/member-scope"
import { workspaceActionClient } from "@/lib/safe-action"
import { previewTranslation } from "../lib/preview-text"
import { previewTranslationRequest } from "../schema/action"

export const previewTranslationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(previewTranslationRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
      ctx,
    }) => {
      // Member scope applies: an agent limited to assigned conversations gets
      // a 404 for any other conversation, same as the public API.
      const conversation = await assertConversationAccessForCaller(
        {
          workspace: ctx.workspace,
          member: ctx.workspaceMember,
          user: ctx.user,
        },
        conversationId,
      )
      return await previewTranslation({
        workspaceId,
        conversation,
        request: parsedInput,
      })
    },
  )
