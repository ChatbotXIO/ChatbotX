"use server"

import { contactService } from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type RemoveContactSequenceRequest,
  removeContactSequenceRequest,
} from "../schemas/contact-sequence"

const CHUNK_SIZE = 1000

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
      for (let i = 0; i < parsedInput.ids.length; i += CHUNK_SIZE) {
        const contactIdChunk = parsedInput.ids.slice(i, i + CHUNK_SIZE)
        const contacts = await contactService.findManyByIds({
          workspaceId,
          ids: contactIdChunk,
          accessScope,
        })

        if (contacts.length === 0) {
          continue
        }

        await contactSequenceService.removeContactSequencesForContacts({
          workspaceId,
          contactIds: contacts.map((contact) => contact.id),
          sequenceIds: parsedInput.sequences,
          reason: "enrollment_removed",
        })
      }
    },
  )
