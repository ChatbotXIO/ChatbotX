"use server"

import { tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type UpdateContactTagRequest,
  updateContactTagRequest,
} from "../schema/contact-tag"

export const updateContactTagAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: UpdateContactTagRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      return await tagService.syncContactTags({
        workspaceId,
        contactId: parsedInput.contactId,
        tags: parsedInput.tags,
        accessScope,
      })
    },
  )
