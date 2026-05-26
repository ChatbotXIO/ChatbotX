"use server"

import {
  auditLogActions,
  contactEventTypes,
  logAudit,
  recordContactEventBulk,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import {
  type WorkspaceIdRequestParams,
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
      ctx: { user },
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: DeleteContactCustomFieldsRequest
      ctx: { user: { id: string } }
    }) => {
      await deleteContactCustomFields({
        workspaceId,
        contactIds: parsedInput.ids,
        customFieldId: parsedInput.customFieldId,
      })

      if (parsedInput.ids.length > 0) {
        await Promise.all([
          logAudit({
            workspaceId,
            userId: user.id,
            action: auditLogActions.CONTACT_FIELD_UPDATED,
            detail: `Campo personalizado "${parsedInput.customFieldId}" limpo em ${parsedInput.ids.length} contato(s)`,
          }),
          recordContactEventBulk({
            contactIds: parsedInput.ids,
            workspaceId,
            eventType: contactEventTypes.FIELD_UPDATED,
            meta: {
              customFieldId: parsedInput.customFieldId,
              cleared: true,
            },
            actorUserId: user.id,
          }),
        ])
      }
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
