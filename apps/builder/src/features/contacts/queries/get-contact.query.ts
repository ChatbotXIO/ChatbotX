import { contactService } from "@chatbotx.io/business"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import type { ContactPermissionScope } from "../permissions"
import { maskContactEmailAndPhone } from "../permissions"
import type { GetContactRequest, GetContactResponse } from "../schema/query"

/**
 * Loads one contact using the caller-resolved scope so assignment and PII
 * restrictions are applied consistently across every caller.
 */
export async function getContact(
  input: GetContactRequest,
  scope: ContactPermissionScope,
): Promise<GetContactResponse> {
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
