"use server"

import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type AddContactSequenceRequest,
  addContactSequenceRequest,
} from "../schema/contact-sequence"

export const addContactSequenceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(addContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: AddContactSequenceRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)

      await contactSequenceService.enrollContacts({
        workspaceId,
        contactIds: parsedInput.ids,
        sequenceIds: parsedInput.sequences,
        accessScope,
      })
    },
  )
