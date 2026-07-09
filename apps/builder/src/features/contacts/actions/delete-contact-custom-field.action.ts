"use server"

import { type ContactAccessScope, contactService } from "@chatbotx.io/business"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
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

  await db.delete(contactCustomFieldModel).where(
    and(
      inArray(
        contactCustomFieldModel.contactId,
        contacts.map((c) => c.id),
      ),
      eq(contactCustomFieldModel.customFieldId, customFieldId),
    ),
  )
}
