"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  type FillableContactKey,
  fillableContactKeys,
} from "@chatbotx.io/database/partials"
import {
  contactCustomFieldModel,
  contactModel,
} from "@chatbotx.io/database/schema"
import type { ContactModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/query"
import { workspaceActionClient } from "@/lib/safe-action"
import { maxPerPageString } from "@/lib/shared-request"
import {
  type UpdateContactFieldRequest,
  updateContactFieldRequest,
} from "../schemas/action"

export const updateContactFieldAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateContactFieldRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await updateContactFields({ workspaceId, id }, parsedInput)
  })

export const updateContactFields = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateContactFieldRequest,
) => {
  const contact = await findOrFail({
    table: contactModel,
    where: {
      workspaceId: ctx.workspaceId,
      id: ctx.id,
    },
    message: "Contact not found",
  })

  const allCustomFields = await listCustomFields({
    workspaceId: ctx.workspaceId,
    ...listCustomFieldsSearchParams.parse({
      perPage: maxPerPageString,
    }),
  })
  const allCustomFieldsMap = new Map(
    allCustomFields.data.map((field) => [field.id.toString(), field]),
  )

  // Prepare data
  const contactFields: Partial<ContactModel> = {}
  const customFields: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(parsedInput)) {
    if (fillableContactKeys.includes(key as FillableContactKey)) {
      // biome-ignore lint/suspicious/noExplicitAny: we know the key is a valid field
      ;(contactFields as any)[key] = value
    } else if (allCustomFieldsMap.has(key)) {
      customFields[key] = value
    }
  }

  await db.transaction(async (tx) => {
    if (Object.keys(contactFields).length > 0) {
      await tx
        .update(contactModel)
        .set(contactFields)
        .where(eq(contactModel.id, contact.id))
    }

    if (Object.keys(customFields).length > 0) {
      for (const [key, value] of Object.entries(customFields)) {
        await tx
          .insert(contactCustomFieldModel)
          .values({
            contactId: ctx.id,
            customFieldId: key,
            value: value as string,
          })
          .onConflictDoUpdate({
            target: [
              contactCustomFieldModel.contactId,
              contactCustomFieldModel.customFieldId,
            ],
            set: {
              value: value as string,
            },
          })
      }
    }
  })
}
