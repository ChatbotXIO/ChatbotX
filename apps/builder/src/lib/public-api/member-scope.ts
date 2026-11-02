import {
  contactService,
  conversationService,
  UNSCOPED,
} from "@chatbotx.io/business"
import { maskContactEmailAndPhone } from "@chatbotx.io/business/contact-utils"
import { notFoundException } from "@chatbotx.io/business/errors"
import type {
  ConversationModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import type { MemberChatScope } from "@/features/realtime/lib/member-chat-scope"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"

/**
 * Member scoping for `/v1` handlers.
 *
 * Workspace API tokens and MCP OAuth are workspace-level: `context.member` is
 * unset and every helper here is a no-op (returns the unscoped behavior), so
 * those callers see exactly what they saw before. A mobile JWT principal sets
 * `context.member`; then each helper applies the same rules the web app applies
 * to that member — contact scope (`restrictToAssignedUserId`, email/phone
 * masking) and conversation scope (own + team conversations for an
 * assigned-only agent).
 *
 * Every handler listed in `MOBILE_MEMBER_ROUTES` must call one of these.
 *
 * The permission/realtime modules these rules live in pull in the whole
 * better-auth stack, so they are imported lazily, only on the member branch;
 * a workspace-token request (and any module that merely imports this file)
 * never loads them.
 */
export type MemberScopeContext = {
  workspace: Pick<WorkspaceModel, "id">
  member?: WorkspaceMemberModel
}

// ── Contacts ────────────────────────────────────────────────────────────────

/**
 * Resolves a contact identifier to an id and, for a member, proves the member
 * may see that contact (contacts-section access AND inside their assigned
 * scope); anything else is the same 404 a missing contact gets, so existence is
 * never exposed.
 */
export const resolveContactIdForCaller = async (
  context: MemberScopeContext,
  props: { identifier: string; workspaceId: string },
): Promise<string> => {
  const contactId = await contactService.resolveIdByIdentifier(props)
  if (context.member) {
    const { requireContactAccessForMember } = await import(
      "@/features/contacts/permissions"
    )
    await requireContactAccessForMember({
      permissions: context.member.permissions,
      userId: context.member.userId,
      workspaceId: props.workspaceId,
      contactId,
    })
  }
  return contactId
}

/** `scope` argument for `contactService.list`/`count`. */
export const contactListScopeForCaller = async (
  context: MemberScopeContext,
) => {
  if (!context.member) {
    return UNSCOPED
  }
  const { buildContactPermissionScope } = await import(
    "@/features/contacts/permissions"
  )
  const scope = buildContactPermissionScope({
    permissions: context.member.permissions,
    userId: context.member.userId,
  })
  if (!scope) {
    throw notFoundException("Contact not found")
  }
  return scope
}

/** Hides email/phone from a member who lacks the `emailAndPhone` permission. */
export const maskContactForCaller = <
  TContact extends { email: string | null; phoneNumber: string | null },
>(
  context: MemberScopeContext,
  contact: TContact,
): TContact =>
  context.member &&
  !hasWorkspacePermission(context.member.permissions, "emailAndPhone")
    ? maskContactEmailAndPhone(contact)
    : contact

export const canCallerViewEmailAndPhone = (
  context: MemberScopeContext,
): boolean =>
  context.member
    ? hasWorkspacePermission(context.member.permissions, "emailAndPhone")
    : true

// ── Conversations ───────────────────────────────────────────────────────────

export type ConversationAccess = MemberChatScope & { userId: string }

type ConversationAssignment = Pick<
  ConversationModel,
  "assignedUserId" | "assignedInboxTeamId"
>

export const conversationAccessForCaller = async (
  context: MemberScopeContext,
): Promise<ConversationAccess | undefined> => {
  if (!context.member) {
    return
  }
  const { resolveMemberChatScope } = await import(
    "@/features/realtime/lib/member-chat-scope"
  )
  const scope = await resolveMemberChatScope({
    workspaceId: context.workspace.id,
    userId: context.member.userId,
    permissions: context.member.permissions,
  })
  return { ...scope, userId: context.member.userId }
}

export const isConversationVisible = (
  access: ConversationAccess | undefined,
  conversation: ConversationAssignment,
): boolean => {
  if (!access || access.chatScope === "all") {
    return true
  }
  if (access.chatScope === "none") {
    return false
  }
  return (
    conversation.assignedUserId === access.userId ||
    (conversation.assignedInboxTeamId !== null &&
      access.teamIds.includes(conversation.assignedInboxTeamId))
  )
}

/** Relational `where` clause restricting a conversation list to what `access` may see. */
export const conversationAccessWhere = (
  access: ConversationAccess | undefined,
): Record<string, unknown> | undefined => {
  if (!access || access.chatScope === "all") {
    return
  }
  if (access.chatScope === "none") {
    // Matches nothing; `none` is also rejected earlier by the derived scopes.
    return { id: "0" }
  }
  return {
    OR: [
      { assignedUserId: access.userId },
      ...(access.teamIds.length > 0
        ? [{ assignedInboxTeamId: { in: access.teamIds } }]
        : []),
    ],
  }
}

/**
 * For a member: loads the conversation and 404s when it is outside their chat
 * scope. For a workspace token: a no-op, so the handler keeps its existing
 * behavior (and its existing 404 from the service).
 */
export const assertConversationAccessForCaller = async (
  context: MemberScopeContext,
  conversationId: string,
): Promise<void> => {
  const access = await conversationAccessForCaller(context)
  if (!access) {
    return
  }
  const conversation = await conversationService.findByOrFail({
    where: { id: conversationId, workspaceId: context.workspace.id },
  })
  if (!isConversationVisible(access, conversation)) {
    throw notFoundException("Conversation not found")
  }
}
