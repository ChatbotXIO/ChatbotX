"use server"

import { type ContactAccessScope, tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type RemoveContactTagsRequest,
  removeContactTagsRequest,
} from "../schemas/contact-tag"

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
      await removeContactTags({
        workspaceId,
        parsedInput,
        accessScope,
      })
    },
  )

export const removeContactTags = async ({
  workspaceId,
  parsedInput,
  accessScope,
}: {
  workspaceId: string
  parsedInput: RemoveContactTagsRequest
  accessScope?: ContactAccessScope
}) =>
  await tagService.removeFromContacts({
    workspaceId,
    ids: parsedInput.ids,
    tags: parsedInput.tags,
    accessScope,
  })
