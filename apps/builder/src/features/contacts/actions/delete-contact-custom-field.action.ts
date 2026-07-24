"use server"

import {
  type ContactAccessScope,
  contactCustomFieldService,
  contactService,
} from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireContactPermissionScope } from "../permissions"
import {
  type DeleteContactCustomFieldsRequest,
  deleteContactCustomFieldsRequest,
} from "../schemas/contact-custom-field"

export const deleteContactCustomFieldAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteContactCustomFieldsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: DeleteContactCustomFieldsRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      await deleteContactCustomFields({
        workspaceId,
        contactIds: parsedInput.ids,
        customFieldId: parsedInput.customFieldId,
        accessScope,
      })
    },
  )

export const deleteContactCustomFields = async ({
  workspaceId,
  contactIds,
  customFieldId,
  accessScope,
}: {
  workspaceId: string
  contactIds: string[]
  customFieldId: string
  accessScope?: ContactAccessScope
}) => {
  const contacts = await contactService.findManyByIds({
    workspaceId,
    ids: contactIds,
    accessScope,
  })

  if (contacts.length === 0) {
    return
  }

  await contactCustomFieldService.deleteByCustomFieldId({
    workspaceId,
    contactIds: contacts.map((contact) => contact.id),
    customFieldId,
  })
}
