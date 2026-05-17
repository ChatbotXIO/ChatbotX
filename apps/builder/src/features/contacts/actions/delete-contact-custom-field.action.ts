"use server"

const NUMERIC_RE = /^\d+$/

import { and, db, eq, inArray, or } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  customFieldModel,
} from "@chatbotx.io/database/schema"
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

export const deleteContactCustomFieldsByFields = async ({
  workspaceId,
  contactId,
  keys,
}: {
  workspaceId: string
  contactId: string
  keys: string[]
}) => {
  try {
    const numericKeys = keys.filter((k) => NUMERIC_RE.test(k))

    const idOrNameCondition =
      numericKeys.length > 0
        ? or(
            inArray(customFieldModel.id, numericKeys),
            inArray(customFieldModel.name, keys),
          )
        : inArray(customFieldModel.name, keys)

    const matched = await db
      .select({ id: customFieldModel.id })
      .from(customFieldModel)
      .where(
        and(eq(customFieldModel.workspaceId, workspaceId), idOrNameCondition),
      )

    const resolvedIds = matched.map((f) => f.id)

    if (resolvedIds.length === 0) {
      return
    }

    await db
      .delete(contactCustomFieldModel)
      .where(
        and(
          eq(contactCustomFieldModel.contactId, contactId),
          inArray(contactCustomFieldModel.customFieldId, resolvedIds),
        ),
      )

    revalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#fields`,
    ])
  } catch (error) {
    console.error("[deleteContactCustomFieldsByFields] Error:", error)
  }
}
