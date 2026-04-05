"use server"

import { db } from "@chatbotx.io/database/client"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
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
      bindArgsParsedInputs: ChatbotIdRequestParams
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
}: {
  workspaceId: string
  contactIds: string[]
  customFieldId: string
}) => {
  const contacts = await db.query.contactModel.findMany({
    where: {
      workspaceId,
      id: {
        in: contactIds,
      },
    },
    columns: {
      id: true,
    },
  })
  if (contacts.length === 0) {
    return
  }

  // if (isCuid(customFieldId)) {
  //   const customField = await findOrFail(
  //     customFieldModel,
  //     {
  //       workspaceId,
  //       id: customFieldId,
  //     },
  //     "Custom field not found",
  //   )

  //   await db.transaction(async (tx) => {
  //     await tx.delete(contactCustomFieldModel).where(
  //       and(
  //         inArray(
  //           contactCustomFieldModel.contactId,
  //           contacts.map((c) => c.id),
  //         ),
  //         eq(contactCustomFieldModel.customFieldId, customField.id),
  //       ),
  //     )
  //   })
  // } else if (
  //   fillableContactKeys.includes(customFieldId as FillableContactKeys)
  // ) {
  //   await db
  //     .update(contactModel)
  //     .set({
  //       [customFieldId]: "",
  //     })
  //     .where(
  //       and(
  //         inArray(
  //           contactModel.id,
  //           contacts.map((c) => c.id),
  //         ),
  //         eq(contactModel.workspaceId, workspaceId),
  //       ),
  //     )
  // }

  revalidateCacheTags([
    `workspaces:${workspaceId}#contacts`,
    `workspaces:${workspaceId}#conversations`,
    `workspaces:${workspaceId}#fields`,
  ])
}
