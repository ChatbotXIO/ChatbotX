"use server"

import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type RemoveContactSequenceRequest,
  removeContactSequenceRequest,
} from "../schema/contact-sequence"

export const removeContactSequenceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(removeContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: RemoveContactSequenceRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      await contactSequenceService.unsubscribeContacts({
        workspaceId,
        contactIds: parsedInput.ids,
        sequenceIds: parsedInput.sequences,
        accessScope,
      })
    },
  )
