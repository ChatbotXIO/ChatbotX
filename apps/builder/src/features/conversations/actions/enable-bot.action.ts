"use server"

import { conversationService } from "@chatbotx.io/business"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const enableBotForConversations = async (props: {
  workspaceId: string
  ids: string[]
  userId: string
}) => {
  const conversations = await conversationService.findManyByIds({
    workspaceId: props.workspaceId,
    ids: props.ids,
  })

  await conversationService.enableBotState({
    workspaceId: props.workspaceId,
    conversations,
    userId: props.userId,
    triggerContext: {
      triggerSource: "api",
      triggerHandler: "enableBotAction",
      triggerType: "conversation_transferred_to_bot",
    },
  })
}

export const enableBotAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkUpdateIdsRequest
      ctx: { user: UserModel }
    }) => {
      await enableBotForConversations({
        workspaceId,
        ids: parsedInput.ids,
        userId: ctx.user.id,
      })
    },
  )
