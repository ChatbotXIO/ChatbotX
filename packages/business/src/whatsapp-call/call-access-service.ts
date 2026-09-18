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
 * P2 item 5 (plan D3 + D8): the ONE authorization check every caller that
 * starts, joins, or resumes a call runs — a single, non-throwing core check
 * (reuses `isEligibleForConversationCall`, the exact predicate ring
 * selection already applies) so the D3 rule is never duplicated. Every
 * caller (action boundary or `listResumableIncoming`'s per-candidate filter)
 * treats a denial the same way — `false` covers every reason alike (not a
 * member, ineligible member, unresolvable conversation) so a caller can
 * never distinguish "no such call/conversation" from "not your call" by
 * probing the result. Throwing a translated exception at the action
 * boundary is the app layer's job (business code does not own i18n) — see
 * `apps/builder/.../calling/actions/assert-call-access.ts`.
 *
 * Both reads are FRESH and UNCACHED (`conversationService.findByUncached`,
 * `workspaceMemberService.listPermissionsByUserIds`, never the cached
 * `findBy`/`listByWorkspaceId` ring selection uses) — a reassignment or a
 * permission change between two calls to this service must be seen
 * immediately, not after a cache TTL.
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
 * Loads the caller's ring-eligibility member row ONCE — the scaling entry
 * point for a caller that evaluates MANY candidates for the same
 * `workspaceId`/`userId` in one request (e.g.
 * `WhatsappVoipCallService.listResumableIncoming`), so a workspace with N
 * ringing calls does not fire N identical permission reads. Pair with
 * {@link canCallConversationForMember} to evaluate each candidate without
 * re-fetching permissions.
 */
export async function loadCallEligibilityMember(input: {
  workspaceId: string
  userId: string
}): Promise<RingMember | null> {
  return await loadRingMember(input)
}

/**
 * Core, non-throwing check for a SINGLE already-loaded member — reused by
 * {@link canCallConversation} (which loads the member itself) and by any
 * caller that preloaded the member via {@link loadCallEligibilityMember} to
 * check several conversations without repeating the permissions read. A
 * missing member or an unresolvable conversation (deleted, or belonging to
 * a different workspace than `workspaceId`) both deny — a conversation that
 * cannot be resolved must never fall open, even for a `superAdmin`/`contacts`
 * member, since it means the caller cannot actually be proven to hold
 * conversation-scoped access.
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
 * Core, non-throwing check: loads the member and the conversation fresh,
 * then delegates to {@link canCallConversationForMember}. The single entry
 * point for every caller that checks exactly one call/conversation (outbound
 * dial, outbound mode resolution, permission requests, the inbound answer
 * flow, and the inbound TURN gate).
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
 * P5 item 3 (plan D4): `superAdmin` or `analytics` see every call in the
 * workspace, both for the Calls page list and for the four artifact
 * actions (recording, transcript, summary, generate-summary) — no `history`/
 * `artifact` divergence on WHO the admin tier covers, only on what a
 * non-admin viewer may additionally see (their own calls vs. any call they
 * can see the conversation for).
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
  /** Bypasses the per-row rule entirely — `superAdmin`/`analytics`. */
  allCalls: (permissions: RingMember["permissions"]) => boolean
  /** Evaluated only when {@link allCalls} is false. */
  row: (
    member: RingMember,
    call: { answeredByUserId: string | null; initiatedByUserId: string | null },
    conversation: RingConversation,
  ) => boolean
}

/**
 * Plan D4's two named read scopes in one object so the Calls page list
 * (`history`) and the four single-call artifact actions (`artifact`) can
 * never drift apart on who counts as an admin. `history` restricts a
 * non-admin to calls they personally answered or placed, AND only within a
 * conversation they are eligible to call (D3) — an `onlyAssignedContacts`
 * member never sees another agent's assigned conversation in their own
 * history, even for a call they happened to answer before reassignment.
 * `artifact` keeps today's in-conversation-card behaviour for every member
 * who can see the conversation (a recording is treated as a
 * conversation attachment), regardless of who answered/placed the call.
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
 * Core, non-throwing check for whether the given, ALREADY-RESOLVED
 * `member` may read ONE call under the given {@link CallReadScopeName} —
 * the single entry point for the four artifact actions (`scope:
 * "artifact"`) and any single-call history read (`scope: "history"`).
 *
 * Takes `member: RingMember` rather than resolving it itself from a bare
 * `userId` (C1 fix): the caller (the action layer, via
 * `workspaceActionClientAllowExpired`'s `ctx.workspaceMemberPermissions`)
 * has ALREADY resolved the member through `resolveWorkspaceAccess`, which
 * synthesizes a membership for a platform support session (AGENTS.md
 * invariant #19) that carries no row in `WorkspaceMember` at all. Re-reading
 * the member here via `WorkspaceMember` (as the list path's
 * `whatsappCallHistoryService.list` never did, and as this function used
 * to) would deny every support session — a real WorkspaceMember row can
 * never be found for one. Passing the resolved member keeps this in sync
 * with `whatsappCallHistoryService.list`, which has always taken
 * `member: { userId, permissions }` for exactly this reason.
 *
 * The `allCalls` (superAdmin/analytics) branch is checked FIRST, before any
 * DB read — an admin's read never needs the call or conversation row at
 * all; the caller's own artifact/history read (`callRecordingService.
 * getRecordingUrlForCall`, etc.) re-validates the call belongs to
 * `workspaceId` on its own read. Only the per-row rule
 * (`CALL_READ_SCOPES[...].row`) needs `findByIdForWorkspace` (scoped by
 * `workspaceId` — a call from another workspace can never be resolved, so
 * it denies rather than throwing a distinguishable "not found") and the
 * conversation lookup, mirroring {@link canCallConversation}'s
 * "unresolvable call/conversation never falls open" discipline.
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
