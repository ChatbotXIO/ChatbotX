import { contactCustomFieldService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import type {
  ListContactCustomFieldsRequest,
  ListPublicContactCustomFieldsResponse,
  PublicContactCustomFieldResource,
} from "../schema/contact-custom-field"

export async function listContactCustomFields(
  input: ListContactCustomFieldsRequest,
): Promise<ListPublicContactCustomFieldsResponse> {
  const data =
    await contactCustomFieldService.listWithDefinitionByContact(input)

  return {
    data: data.map((d) => ({
      ...d.customField,
      type: d.customField.type as CustomFieldType,
      value: d.value,
    })),
  }
}

export async function findContactCustomField(input: {
  contactId: string
  customFieldId: string
  workspaceId: string
}): Promise<PublicContactCustomFieldResource> {
  const contactCustomField =
    await contactCustomFieldService.findWithDefinition(input)

  if (!contactCustomField) {
    throw notFoundException("Contact custom field not found")
  }
  return {
    ...contactCustomField.customField,
    type: contactCustomField.customField.type as CustomFieldType,
    value: contactCustomField.value,
  }
}
