"use server"

import { type ContactAccessScope, tagService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type AddContactTagRequest,
  addContactTagRequest,
} from "../schemas/contact-tag"

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
      await addContactTags({
        workspaceId,
        parsedInput,
        accessScope,
      })
    },
  )

export const addContactTags = async ({
  workspaceId,
  parsedInput,
  accessScope,
}: {
  workspaceId: string
  parsedInput: AddContactTagRequest
  accessScope?: ContactAccessScope
}) =>
  await tagService.addToContacts({
    workspaceId,
    ids: parsedInput.ids,
    tags: parsedInput.tags,
    accessScope,
  })

export const detachContactTag = async ({
  workspaceId,
  contactId,
  tagId,
}: {
  workspaceId: string
  contactId: string
  tagId: string
}) =>
  await tagService.detachFromContact({
    workspaceId,
    contactId,
    tagIds: [tagId],
  })

// Unused elsewhere today (kept as-is per Phase 1 scope).
export const attachContactTag = async ({
  workspaceId,
  contactId,
  tagId,
}: {
  workspaceId: string
  contactId: string
  tagId: string
}) =>
  await tagService.attachToContact({
    workspaceId,
    contactId,
    tagIds: [tagId],
  })

export const attachContactTags = async ({
  workspaceId,
  contactId,
  tagIds,
}: {
  workspaceId: string
  contactId: string
  tagIds: string[]
}) => await tagService.attachToContact({ workspaceId, contactId, tagIds })

export const detachContactTags = async ({
  workspaceId,
  contactId,
  tagIds,
}: {
  workspaceId: string
  contactId: string
  tagIds: string[]
}) => await tagService.detachFromContact({ workspaceId, contactId, tagIds })
