import {
  buildContactPermissionScope,
  type ConversationMemberScope,
  contactService,
  conversationMemberScope,
  conversationService,
  UNSCOPED,
} from "@chatbotx.io/business"
import { maskContactEmailAndPhone } from "@chatbotx.io/business/contact-utils"
import { notFoundException } from "@chatbotx.io/business/errors"
import { hasWorkspacePermission } from "@chatbotx.io/business/workspace-member/permissions"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"

/**
 * Member scoping for `/v1` handlers.
 *
 * Workspace API tokens and MCP OAuth are workspace-level: `context.member` is
 * unset and every helper here preserves the existing unscoped behavior. A
 * mobile JWT principal sets `context.member`, so each helper applies the same
 * contact and conversation scope as the web app.
 */
type MemberScopeContext = {
  workspace: Pick<WorkspaceModel, "id">
  member?: WorkspaceMemberModel
  user?: Pick<UserModel, "id">
  memberConversationScope?: Promise<ConversationMemberScope>
}

const conversationScopeForCaller = async (
  context: MemberScopeContext,
): Promise<ConversationMemberScope | undefined> => {
  if (!context.member) {
    return
  }
  context.memberConversationScope ??= conversationMemberScope.resolve({
    workspaceId: context.workspace.id,
    userId: context.member.userId,
    permissions: context.member.permissions,
  })
  return await context.memberConversationScope
}

const contactScopeForCaller = async (context: MemberScopeContext) => {
  if (!context.member) {
    return UNSCOPED
  }
  const scope = buildContactPermissionScope({
    permissions: context.member.permissions,
    userId: context.member.userId,
  })
  if (!scope) {
    throw notFoundException("Contact not found")
  }
  const conversationScope = await conversationScopeForCaller(context)
  return {
    ...scope,
    restrictToTeamIds:
      conversationScope?.chatScope === "assigned" &&
      conversationScope.teamIds.length > 0
        ? conversationScope.teamIds
        : undefined,
  }
}

/**
 * Resolves a contact identifier to an id and, for a member, proves the member
 * may see that contact. Anything else is the same 404 a missing contact gets,
 * so existence is never exposed.
 */
export const resolveContactIdForCaller = async (
  context: MemberScopeContext,
  props: { identifier: string; workspaceId: string },
): Promise<string> => {
  const contactId = await contactService.resolveIdByIdentifier(props)
  if (context.member) {
    const scope = await contactScopeForCaller(context)
    const accessScope =
      scope === UNSCOPED
        ? undefined
        : {
            restrictToAssignedUserId: scope.restrictToAssignedUserId,
            ...(scope.restrictToTeamIds && {
              restrictToTeamIds: scope.restrictToTeamIds,
            }),
          }
    await contactService.findByIdOrFail({
      workspaceId: props.workspaceId,
      id: contactId,
      accessScope,
    })
  }
  return contactId
}

export const contactIdFor = async (
  context: MemberScopeContext,
  identifier: string,
): Promise<string> =>
  await resolveContactIdForCaller(context, {
    identifier,
    workspaceId: context.workspace.id,
  })

/** `scope` argument for `contactService.list`/`count`. */
export const contactListScopeForCaller = async (context: MemberScopeContext) =>
  await contactScopeForCaller(context)

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

/** Returns the middleware-resolved mobile user for outgoing message attribution. */
export const resolveSenderForCaller = (
  context: MemberScopeContext,
): Pick<UserModel, "id"> | undefined =>
  context.member ? context.user : undefined

export const conversationAccessForCaller = async (
  context: MemberScopeContext,
): Promise<ConversationMemberScope | undefined> =>
  await conversationScopeForCaller(context)

/**
 * Loads a conversation once and returns it after applying the caller's member
 * scope. Workspace tokens remain unscoped but still receive the resource's
 * existing not-found behavior.
 */
export const assertConversationAccessForCaller = async (
  context: MemberScopeContext,
  conversationId: string,
) => {
  const conversation = await conversationService.findByOrFail({
    where: { id: conversationId, workspaceId: context.workspace.id },
  })
  const scope = await conversationScopeForCaller(context)
  if (!conversationMemberScope.allows(scope, conversation)) {
    throw notFoundException("Conversation not found")
  }
  return conversation
}
