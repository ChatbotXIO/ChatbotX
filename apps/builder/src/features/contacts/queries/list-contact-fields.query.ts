import { db } from "@aha.chat/database/client"
import { notFoundException } from "@/lib/errors/exception"
import type {
  ListContactCustomFieldsRequest,
  ListPublicContactCustomFieldsResponse,
  PublicContactCustomFieldResource,
} from "../schemas/contact-custom-field"

export async function listContactCustomFields(
  input: ListContactCustomFieldsRequest,
): Promise<ListPublicContactCustomFieldsResponse> {
  const data = await db.query.contactCustomFieldModel.findMany({
    where: {
      contactId: input.contactId,
    },
    with: {
      customField: true,
    },
  })

  return {
    data: data.map((d) => ({
      ...d.customField,
      value: d.value,
    })),
  }
}

export async function findContactCustomField(input: {
  contactId: string
  customFieldId: string
  chatbotId: string
}): Promise<PublicContactCustomFieldResource> {
  const contactCustomField = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: input.contactId,
      customFieldId: input.customFieldId,
      customField: {
        chatbotId: input.chatbotId,
      },
    },
    with: {
      customField: true,
    },
  })

  if (!contactCustomField) {
    throw notFoundException("Contact custom field not found")
  }
  return {
    ...contactCustomField.customField,
    value: contactCustomField.value,
  }
}
