"use server"

import { conversationService } from "@chatbotx.io/business"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const archiveConversations = async (props: {
  workspaceId: string
  ids: string[]
  userId: string
}) => {
  const conversations = await conversationService.findManyByIds({
    workspaceId: props.workspaceId,
    ids: props.ids,
  })

  await conversationService.updateArchived({
    workspaceId: props.workspaceId,
    conversations,
    archivedAt: new Date(),
    userId: props.userId,
    triggerContext: {
      triggerSource: "api",
      triggerHandler: "archiveConversationAction",
      triggerType: "conversation_archived",
    },
  })
}

export const archiveConversationAction = workspaceActionClient
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
      await archiveConversations({
        workspaceId,
        ids: parsedInput.ids,
        userId: ctx.user.id,
      })
    },
  )
