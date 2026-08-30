"use server"

import { conversationService } from "@chatbotx.io/business"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const unarchiveConversations = async (props: {
  workspaceId: string
  ids: string[]
}) => {
  const conversations = await conversationService.findManyByIds({
    workspaceId: props.workspaceId,
    ids: props.ids,
  })

  await conversationService.updateArchived({
    workspaceId: props.workspaceId,
    conversations,
    archivedAt: null,
    triggerContext: {
      triggerSource: "api",
      triggerHandler: "unarchiveConversationAction",
      triggerType: "conversation_unarchived",
    },
  })
}

export const unarchiveConversationAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await unarchiveConversations({ workspaceId, ids: parsedInput.ids })
    },
  )
