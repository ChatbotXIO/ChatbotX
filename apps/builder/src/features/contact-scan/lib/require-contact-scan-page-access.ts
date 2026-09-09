import { ChatbotXException } from "@chatbotx.io/business/errors"
import { notFound } from "next/navigation"
import { requireUnrestrictedContactsScope } from "./require-unrestricted-contacts-scope"

/**
 * Server-side gate for the Automatic Customer Scan page
 * (`app/space/[workspaceId]/contacts/scan/page.tsx`). Wraps
 * `requireUnrestrictedContactsScope` — the same scope check
 * `scheduleContactScanAction` and `getContactScanStatusAuthenticatedAPI`
 * enforce — but converts its thrown `ChatbotXException` (e.g.
 * `contactScanForbidden` for an assigned-only member) into `notFound()`,
 * consistent with how `requireContactsAccess` and
 * `requireWorkspacePermission` gate other pages in this app: a denied
 * caller sees a 404, never a raw exception page.
 */
export async function requireContactScanPageAccess(
  workspaceId: string,
): Promise<void> {
  try {
    await requireUnrestrictedContactsScope(workspaceId)
  } catch (error) {
    if (error instanceof ChatbotXException) {
      notFound()
    }
    throw error
  }
}
