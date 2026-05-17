import { notFoundException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import type { GetContactRequest, GetContactResponse } from "../schemas/query"

export async function getContact(
  input: GetContactRequest,
): Promise<GetContactResponse> {
  const contact = await db.query.contactModel.findFirst({
    where: {
      id: input.contactId,
      workspaceId: input.workspaceId,
    },
    with: {
      tags: true,
      contactCustomFields: {
        with: {
          customField: true,
        },
      },
      contactNotes: true,
      contactsOnSequences: {
        with: {
          sequence: true,
        },
      },
    },
  })

  if (!contact) {
    throw notFoundException("Contact not found")
  }

  const { contactCustomFields, ...contactFields } = contact

  return {
    ...contactFields,
    customFields: contactCustomFields.map((ccf) => ({
      ...ccf.customField,
      type: ccf.customField.type as CustomFieldType,
      value: ccf.value,
    })),
  }
}
