import { notFoundException } from "@chatbotx.io/business/errors"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { contactRepository } from "@chatbotx.io/database/repositories"
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

  const contact = await contactRepository.findDetailById({
    id: input.contactId,
    workspaceId: input.workspaceId,
  })

  if (!contact) {
    throw notFoundException("Contact not found")
  }

  if (
    scope.restrictToAssignedUserId &&
    contact.conversation?.assignedUserId !== scope.restrictToAssignedUserId
  ) {
    throw notFoundException("Contact not found")
  }

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
