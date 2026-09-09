import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type ContactPermissionScope,
  requireContactPermissionScope,
} from "@/features/contacts/permissions"

/**
 * Shared by `scheduleContactScanAction` and
 * `getContactScanStatusAuthenticatedAPI` — an assigned-only member
 * (`restrictToAssignedUserId` set) must neither trigger a Page-wide
 * Automatic Customer Scan nor read its counts/errors (plan §7 decision 10).
 * `superAdmin` bypasses `onlyAssignedContacts` inside
 * `getAssignedContactsUserId` (`contacts/permissions.ts:31-40`), so a super
 * admin always gets an unrestricted scope here.
 */
export async function requireUnrestrictedContactsScope(
  workspaceId: string,
): Promise<ContactPermissionScope> {
  const scope = await requireContactPermissionScope(workspaceId)
  if (scope.restrictToAssignedUserId) {
    throw new ChatbotXException(
      "You do not have permission to run an Automatic Customer Scan.",
      "contactScanForbidden",
      403,
    )
  }
  return scope
}
