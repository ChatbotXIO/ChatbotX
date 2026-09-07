import { contactService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  maskContactEmailAndPhone,
  resolveContactPermissionScope,
} from "../permissions"
import type { GetContactRequest, GetContactResponse } from "../schema/query"

export async function getContact(
  input: GetContactRequest,
): Promise<GetContactResponse> {
  const scope = await resolveContactPermissionScope(input.workspaceId)
  if (!scope) {
    throw notFoundException("Contact not found")
  }

  const contact = await contactService.findDetailOrFail({
    workspaceId: input.workspaceId,
    id: input.contactId,
    accessScope: { restrictToAssignedUserId: scope.restrictToAssignedUserId },
  })

  const {
    contactCustomFields,
    conversation: _conversation,
    ...contactFields
  } = contact
  const visibleContactFields = scope.canViewEmailAndPhone
    ? contactFields
    : maskContactEmailAndPhone(contactFields)

  return {
    ...visibleContactFields,
    customFields: contactCustomFields.map((ccf) => ({
      ...ccf.customField,
      type: ccf.customField.type as CustomFieldType,
      value: ccf.value,
    })),
  }
}
