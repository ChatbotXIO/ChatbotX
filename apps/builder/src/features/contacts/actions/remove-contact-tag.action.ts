"use server"

import { tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type RemoveContactTagsRequest,
  removeContactTagsRequest,
} from "../schema/contact-tag"

export const removeContactTagAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(removeContactTagsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: RemoveContactTagsRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      await tagService.removeFromContacts({
        workspaceId,
        ids: parsedInput.ids,
        tags: parsedInput.tags,
        accessScope,
      })
    },
  )
