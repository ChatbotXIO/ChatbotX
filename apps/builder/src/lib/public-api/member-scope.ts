import {
  buildContactPermissionScope,
  type ConversationMemberScope,
  contactService,
  conversationMemberScope,
  conversationService,
  flowService,
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
import { logger } from "@/lib/log"

/**
 * Member scoping for `/v1` handlers.
 *
 * Workspace API tokens and MCP OAuth are workspace-level: `context.member` is
 * unset and every helper here preserves the existing unscoped behavior. A
 * mobile JWT principal sets `context.member`, so each helper applies the same
 * contact and conversation scope as the web app.
 */
export type MemberScopeContext = {
  workspace: Pick<WorkspaceModel, "id">
  // Only these fields are read, so a server action can pass the membership
  // `resolveWorkspaceAccess` resolved (real or synthetic support access).
  member?: Pick<WorkspaceMemberModel, "userId" | "permissions">
  user?: Pick<UserModel, "id">
  memberConversationScope?: Promise<ConversationMemberScope>
}

export const conversationScopeForCaller = async (
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

export const contactScopeForCaller = async (context: MemberScopeContext) => {
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
      conversationScope?.chatScope === "assigned"
        ? conversationScope.teamIds
        : undefined,
  }
}

/**
 * Resolves a contact identifier to an id and, for a member, proves the member
 * may see that contact. Anything else is the same 404 a missing contact gets,
 * so existence is never exposed.
 */
export const contactIdFor = async (
  context: MemberScopeContext,
  identifier: string,
): Promise<string> => {
  const contactId = await contactService.resolveIdByIdentifier({
    identifier,
    workspaceId: context.workspace.id,
  })
  if (!context.member) {
    return contactId
  }
  const scope = await contactScopeForCaller(context)
  const accessScope =
    scope === UNSCOPED
      ? undefined
      : {
          restrictToAssignedUserId: scope.restrictToAssignedUserId,
          ...(scope.restrictToTeamIds !== undefined && {
            restrictToTeamIds: scope.restrictToTeamIds,
          }),
        }
  await contactService.findByIdOrFail({
    workspaceId: context.workspace.id,
    id: contactId,
    accessScope,
  })
  return contactId
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

/** Returns the middleware-resolved mobile user for outgoing message attribution. */
export const resolveSenderForCaller = (
  context: MemberScopeContext,
): Pick<UserModel, "id"> | undefined =>
  context.member ? context.user : undefined

/**
 * A member without the general flows permission may only start flows that are
 * explicitly enabled in an inbox. Workspace-token callers remain unrestricted.
 */
export const assertMemberMayStartFlow = async (
  context: MemberScopeContext,
  flowId: string | undefined,
): Promise<void> => {
  if (
    !(
      flowId &&
      context.member &&
      !hasWorkspacePermission(context.member.permissions, "flows")
    )
  ) {
    return
  }
  await flowService.assertEnabledInInbox({
    workspaceId: context.workspace.id,
    flowId,
  })
}

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

/** Whether the caller may see one conversation of the workspace. */
export type ConversationAccessCheck = (
  conversationId: string,
) => Promise<boolean>

/**
 * A check of the caller's conversation member scope, for a read that must
 * keep working outside it but hide what the scope protects (an Inbox read
 * hides `translation` instead of failing). `undefined` when the caller sees
 * every conversation (workspace token, or a member not limited to assigned
 * conversations), so such reads cost no lookup. Each conversation is looked
 * up once per check, and a failed lookup counts as outside the scope.
 */
export const conversationAccessCheckForCaller = async (
  context: MemberScopeContext,
): Promise<ConversationAccessCheck | undefined> => {
  const scope = await conversationScopeForCaller(context)
  if (!scope || scope.chatScope === "all") {
    return
  }
  const checked = new Map<string, Promise<boolean>>()
  return (conversationId) => {
    let allowed = checked.get(conversationId)
    if (!allowed) {
      allowed = conversationService
        .findBy({
          where: { id: conversationId, workspaceId: context.workspace.id },
        })
        .then(
          (conversation) =>
            conversation !== undefined &&
            conversationMemberScope.allows(scope, conversation),
        )
        // Fails closed: a lookup error hides what the scope protects instead
        // of failing the read it guards.
        .catch((err: unknown) => {
          logger.warn(
            { err, workspaceId: context.workspace.id, conversationId },
            "Failed to check a conversation against the member scope",
          )
          return false
        })
      checked.set(conversationId, allowed)
    }
    return allowed
  }
}

/**
 * {@link conversationAccessCheckForCaller}, resolved on the first conversation
 * it is asked about instead of up front. For reads where the check is rarely
 * needed (message translations, for workspaces that never enabled translation)
 * so they cost no member-scope lookup until one is.
 */
export const lazyConversationAccessCheckForCaller = (
  context: MemberScopeContext,
): ConversationAccessCheck => {
  let check: Promise<ConversationAccessCheck | undefined> | undefined
  return async (conversationId) => {
    check ??= conversationAccessCheckForCaller(context)
    const resolved = await check
    return resolved ? await resolved(conversationId) : true
  }
}
