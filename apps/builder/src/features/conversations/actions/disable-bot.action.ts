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

export const disableBotForConversations = async (props: {
  workspaceId: string
  ids: string[]
  userId: string
}) => {
  const conversations = await conversationService.findManyByIds({
    workspaceId: props.workspaceId,
    ids: props.ids,
  })

  await conversationService.disableBotState({
    workspaceId: props.workspaceId,
    conversations,
    userId: props.userId,
    triggerContext: {
      triggerSource: "api",
      triggerHandler: "disableBotAction",
      triggerType: "conversation_transferred_to_human",
    },
  })
}

export const disableBotAction = workspaceActionClient
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
      await disableBotForConversations({
        workspaceId,
        ids: parsedInput.ids,
        userId: ctx.user.id,
      })
    },
  )
