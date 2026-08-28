"use server"

import { type ContactAccessScope, tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import type { TagResource } from "@/features/tags/schema/resource"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type UpdateContactTagRequest,
  updateContactTagRequest,
} from "../schemas/contact-tag"

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
      return await updateContactTags({ workspaceId, parsedInput, accessScope })
    },
  )

export const updateContactTags = async ({
  workspaceId,
  parsedInput,
  accessScope,
}: {
  workspaceId: string
  parsedInput: UpdateContactTagRequest
  accessScope?: ContactAccessScope
}): Promise<TagResource[]> =>
  await tagService.syncContactTags({
    workspaceId,
    contactId: parsedInput.contactId,
    tags: parsedInput.tags,
    accessScope,
  })
