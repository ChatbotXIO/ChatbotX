"use server"

import { contactService } from "@chatbotx.io/business"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
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
      await deleteContactCustomFields({
        workspaceId,
        contactIds: parsedInput.ids,
        customFieldId: parsedInput.customFieldId,
      })
    },
  )

export const deleteContactCustomFields = async ({
  workspaceId,
  contactIds,
  customFieldId,
}: {
  workspaceId: string
  contactIds: string[]
  customFieldId: string
}) => {
  const contacts = await contactService.findManyByIds({
    workspaceId,
    ids: contactIds,
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
