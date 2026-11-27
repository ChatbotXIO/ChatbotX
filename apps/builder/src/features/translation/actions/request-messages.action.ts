"use server"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { assertConversationAccessForCaller } from "@/lib/public-api/member-scope"
import { workspaceActionClient } from "@/lib/safe-action"
import { requestTranslations } from "../lib/request-messages"
import { requestTranslationsRequest } from "../schema/action"

export const requestTranslationsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(requestTranslationsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
      ctx,
    }) => {
      // Member scope applies: an agent limited to assigned conversations gets
      // a 404 for any other conversation, same as the public API.
      await assertConversationAccessForCaller(
        {
          workspace: ctx.workspace,
          member: ctx.workspaceMember,
          user: ctx.user,
        },
        conversationId,
      )
      return await requestTranslations({
        workspaceId,
        conversationId,
        request: parsedInput,
      })
    },
  )
