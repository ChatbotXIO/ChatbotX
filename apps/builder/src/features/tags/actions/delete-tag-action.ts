"use server"

import { tagService } from "@chatbotx.io/business"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteTagAction = workspaceActionClient
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
      await deleteTags({ workspaceId, ids: parsedInput.ids })
    },
  )

export const deleteTags = async (props: {
  workspaceId: string
  ids: string[]
}) => await tagService.deleteMany(props)

export const deleteTag = async (props: { workspaceId: string; id: string }) =>
  await tagService.deleteMany({
    workspaceId: props.workspaceId,
    ids: [props.id],
  })
