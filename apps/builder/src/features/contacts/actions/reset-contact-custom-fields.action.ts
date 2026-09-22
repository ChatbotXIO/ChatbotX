"use server"

import {
  type ContactAccessScope,
  contactCustomFieldService,
  contactService,
} from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type ResetContactCustomFieldsRequest,
  resetContactCustomFieldsRequest,
} from "../schema/contact-custom-field"

export const resetContactCustomFieldsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(resetContactCustomFieldsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ResetContactCustomFieldsRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      await resetContactCustomFields({
        workspaceId,
        contactId: parsedInput.contactId,
        accessScope,
      })
    },
  )

/**
 * Clears every custom-field value of one contact. The contact is resolved
 * through the caller's access scope first, so `clearByContactId` (which scopes
 * its delete by `contactId` alone) can never reach a contact outside the
 * workspace or outside an "only assigned contacts" member's scope.
 */
export const resetContactCustomFields = async ({
  workspaceId,
  contactId,
  accessScope,
}: {
  workspaceId: string
  contactId: string
  accessScope?: ContactAccessScope
}) => {
  const contact = await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
    accessScope,
  })

  await contactCustomFieldService.clearByContactId({
    workspaceId,
    contactId: contact.id,
  })
}
