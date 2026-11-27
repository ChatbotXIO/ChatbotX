import { contactSyncService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isWorkspaceAdminMember } from "@chatbotx.io/business/workspace-member/predicates"
import {
  CONTACT_SYNC_ERROR_CODES,
  type ContactSyncFollowUpChannel,
} from "@chatbotx.io/database/partials"
import { isAhachatConfigured } from "@chatbotx.io/integration-ahachat"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

/**
 * Who may import a page's AhaChat data from the builder: a workspace admin
 * (owner or `superAdmin`, support access included) who is not limited to
 * assigned contacts. Importing writes contacts, tags and fields of the whole
 * workspace and asks AhaChat about its pages, so it is an admin action.
 * Returns the user whose id the signed AhaChat requests name as the actor.
 */
export const requireContactSyncAdmin = async (
  workspaceId: string,
): Promise<{ userId: string }> => {
  const scope = await requireContactPermissionScope(workspaceId)
  const access = await getCurrentUserAndTargetWorkspace(workspaceId)
  // One code for both refusals: a member limited to assigned contacts is not
  // an admin either.
  if (
    scope.restrictToAssignedUserId ||
    !(access && isWorkspaceAdminMember(access.targetWorkspaceMember))
  ) {
    throw new ChatbotXException(
      "Only a workspace admin can sync contacts from AhaChat.",
      CONTACT_SYNC_ERROR_CODES.notAdmin,
      403,
    )
  }
  return { userId: access.user.id }
}

/**
 * Whether the AhaChat sync is offered to the signed-in member of a workspace:
 * the server can talk to AhaChat and the member is an admin the sync accepts.
 * Never throws: a page or a picker uses it to hide the controls, the
 * procedures still enforce the same rule.
 */
export const canUseContactSync = async (
  workspaceId: string,
): Promise<boolean> => {
  if (!isAhachatConfigured()) {
    return false
  }
  try {
    await requireContactSyncAdmin(workspaceId)
    return true
  } catch {
    return false
  }
}

/**
 * Ids of the connect session's pages that AhaChat has, so the picker asks
 * "use data from AhaChat?" only for those. Empty when the member may not use
 * the sync or AhaChat cannot be asked: the picker then offers the normal
 * history sync only. The page ids come from the server-side connect session,
 * never from the client.
 */
export const findConnectPagesOnAhachat = async (input: {
  workspaceId: string
  channel: ContactSyncFollowUpChannel
  pageIds: string[]
}): Promise<string[]> => {
  if (!isAhachatConfigured() || input.pageIds.length === 0) {
    return []
  }
  let userId: string
  try {
    userId = (await requireContactSyncAdmin(input.workspaceId)).userId
  } catch {
    return []
  }
  return contactSyncService.findPagesAtSource({
    workspaceId: input.workspaceId,
    actor: { type: "user", id: userId },
    pages: input.pageIds.map((pageId) => ({ channel: input.channel, pageId })),
  })
}
