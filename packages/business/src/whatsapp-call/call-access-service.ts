import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { conversationService } from "../conversation/service"
import { hasWorkspacePermission } from "../workspace-member/permissions"
import { workspaceMemberService } from "../workspace-member/service"
import {
  isEligibleForConversationCall,
  type RingConversation,
  type RingMember,
} from "./ring-targets"

/**
 * Non-throwing: `false` covers every denial reason alike, so a caller can never
 * distinguish "no such call" from "not your call". Reads are uncached — a
 * reassignment or permission change must be seen immediately.
 */

async function loadRingMember(input: {
  workspaceId: string
  userId: string
}): Promise<RingMember | null> {
  const [row] = await workspaceMemberService.listPermissionsByUserIds({
    workspaceId: input.workspaceId,
    userIds: [input.userId],
  })
  return row ? { userId: row.userId, permissions: row.permissions } : null
}

async function loadRingConversation(input: {
  workspaceId: string
  conversationId: string
}): Promise<RingConversation> {
  const conversation = await conversationService.findByUncached({
    where: { id: input.conversationId, workspaceId: input.workspaceId },
  })
  return conversation
    ? {
        assignedUserId: conversation.assignedUserId,
        assignedInboxTeamId: conversation.assignedInboxTeamId,
      }
    : null
}

/**
 * Loads the caller's ring-eligibility member row once — the scaling entry point
 * for a caller evaluating many candidates for the same workspaceId/userId in
 * one request, so a workspace with N ringing calls does not fire N identical
 * permission reads. Pair with canCallConversationForMember to evaluate each
 * candidate without re-fetching.
 */
export async function loadCallEligibilityMember(input: {
  workspaceId: string
  userId: string
}): Promise<RingMember | null> {
  return await loadRingMember(input)
}

/**
 * Core, non-throwing check for a single already-loaded member, reused by
 * canCallConversation and any caller that preloaded the member to check several
 * conversations without repeating the permissions read. A missing member or an
 * unresolvable conversation both deny — an unresolvable conversation must never
 * fall open, even for a superAdmin/contacts member.
 */
export async function canCallConversationForMember(input: {
  member: RingMember | null
  workspaceId: string
  conversationId: string
}): Promise<boolean> {
  if (!input.member) {
    return false
  }
  const conversation = await loadRingConversation({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
  })
  if (!conversation) {
    return false
  }
  return isEligibleForConversationCall(input.member, conversation)
}

/**
 * Core, non-throwing check: loads the member and conversation fresh, then
 * delegates to canCallConversationForMember. The single entry point for every
 * caller checking exactly one call/conversation.
 */
export async function canCallConversation(input: {
  workspaceId: string
  conversationId: string
  userId: string
}): Promise<boolean> {
  const [member, conversation] = await Promise.all([
    loadRingMember(input),
    loadRingConversation(input),
  ])
  if (!(member && conversation)) {
    return false
  }
  return isEligibleForConversationCall(member, conversation)
}

/**
 * superAdmin or analytics see every call in the workspace, for both the Calls
 * page list and the four artifact actions — no divergence on who the admin tier
 * covers, only on what a non-admin viewer may additionally see.
 */
export function isCallHistoryAdmin(
  permissions: RingMember["permissions"],
): boolean {
  return (
    hasWorkspacePermission(permissions, "superAdmin") ||
    hasWorkspacePermission(permissions, "analytics")
  )
}

/** A call the given member either answered or placed. */
export function isOwnCall(
  member: RingMember,
  call: { answeredByUserId: string | null; initiatedByUserId: string | null },
): boolean {
  return (
    call.answeredByUserId === member.userId ||
    call.initiatedByUserId === member.userId
  )
}

type CallReadScope = {
  /** Bypasses the per-row rule entirely — superAdmin/analytics. */
  allCalls: (permissions: RingMember["permissions"]) => boolean
  /** Evaluated only when allCalls is false. */
  row: (
    member: RingMember,
    call: { answeredByUserId: string | null; initiatedByUserId: string | null },
    conversation: RingConversation,
  ) => boolean
}

/**
 * `history` restricts a non-admin to calls they personally answered or placed,
 * within a conversation they're eligible to call. `artifact` allows any member
 * who can see the conversation, regardless of who answered/placed it.
 */
export const CALL_READ_SCOPES = {
  history: {
    allCalls: isCallHistoryAdmin,
    row: (member, call, conversation) =>
      isOwnCall(member, call) &&
      isEligibleForConversationCall(member, conversation),
  },
  artifact: {
    allCalls: isCallHistoryAdmin,
    row: (member, _call, conversation) =>
      isEligibleForConversationCall(member, conversation),
  },
} as const satisfies Record<"history" | "artifact", CallReadScope>

export type CallReadScopeName = keyof typeof CALL_READ_SCOPES

/**
 * Takes an already-resolved `member` rather than a userId: a platform support
 * session synthesizes a membership with no WorkspaceMember row, and re-reading
 * the table here would deny it. `allCalls` is checked before any DB read; an
 * unresolvable call/conversation never falls open.
 */
export async function canReadCall(input: {
  workspaceId: string
  whatsappCallId: string
  member: RingMember
  scope: CallReadScopeName
}): Promise<boolean> {
  const readScope = CALL_READ_SCOPES[input.scope]
  if (readScope.allCalls(input.member.permissions)) {
    return true
  }
  const call = await whatsappCallRepository.findByIdForWorkspace(
    input.whatsappCallId,
    input.workspaceId,
  )
  if (!call) {
    return false
  }
  const conversation = await loadRingConversation({
    workspaceId: input.workspaceId,
    conversationId: call.conversationId,
  })
  if (!conversation) {
    return false
  }
  return readScope.row(input.member, call, conversation)
}
