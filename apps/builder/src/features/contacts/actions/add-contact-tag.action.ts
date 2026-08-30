"use server"

import { tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type AddContactTagRequest,
  addContactTagRequest,
} from "../schema/contact-tag"

export const addContactTagAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(addContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: AddContactTagRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      await tagService.addToContacts({
        workspaceId,
        ids: parsedInput.ids,
        tags: parsedInput.tags,
        accessScope,
      })
    },
  )
