import {
  hasWorkspacePermission,
  type PermissionsInput,
} from "../workspace-member/permissions"

/**
 * Cap on how many agents a single inbound VoIP call fans out to. Applied
 * after tier resolution and eligibility filtering, never before, so an
 * ineligible online member can never push an eligible one out.
 */
export const MAX_VOIP_RING_TARGETS = 10

/**
 * A conversation's assignment, as far as ring-eligibility and tier selection
 * cares — null when the conversation itself couldn't be resolved (e.g. deleted
 * between handleConnect resolving conversationId and this lookup).
 */
export type RingConversation = {
  assignedUserId: string | null
  assignedInboxTeamId: string | null
} | null

export type RingMember = {
  userId: string
  permissions: PermissionsInput
}

type CallEligibilityRule = (
  member: RingMember,
  conversation: RingConversation,
) => boolean

/**
 * Evaluated top to bottom: superAdmin || contacts || (onlyAssignedContacts &&
 * individually assigned to them). onlyAssignedContacts alone is never
 * enough — a team-assigned-but-not-individually-assigned or unassigned
 * conversation never counts (no auto-claim by ringing). Shared by ringing,
 * pickup, resume, TURN and call reads.
 */
export const CALL_ELIGIBILITY_RULES: readonly CallEligibilityRule[] = [
  (member) => hasWorkspacePermission(member.permissions, "superAdmin"),
  (member) => hasWorkspacePermission(member.permissions, "contacts"),
  (member, conversation) =>
    hasWorkspacePermission(member.permissions, "onlyAssignedContacts") &&
    conversation?.assignedUserId === member.userId,
]

export function isEligibleForConversationCall(
  member: RingMember,
  conversation: RingConversation,
): boolean {
  return CALL_ELIGIBILITY_RULES.some((rule) => rule(member, conversation))
}

export type RingTierName = "assignee" | "assignedTeam" | "eligibleOnline"

/**
 * Everything a tier needs to resolve its candidate user ids — built once per
 * inbound call by the business-layer orchestration and passed unchanged to
 * every tier in RING_TIERS.
 */
export type RingContext = {
  conversation: RingConversation
  /**
   * Online member user ids, presence order (most-recently-renewed tab first),
   * already deduped.
   */
  onlineUserIds: readonly string[]
  /**
   * Permissions for online user ids only (bounded projection) — a userId with
   * no entry (e.g. a synthetic support-session membership, never persisted, or
   * not yet loaded) is excluded by construction.
   */
  permissionsByUserId: ReadonlyMap<string, PermissionsInput>
  /**
   * User ids belonging to conversation.assignedInboxTeamId — empty when the
   * conversation has no assigned team.
   */
  teamMemberUserIds: readonly string[]
}

type RingTier = {
  readonly name: RingTierName
  readonly resolve: (context: RingContext) => readonly string[]
}

const memberOrNull = (
  context: RingContext,
  userId: string,
): RingMember | null => {
  const permissions = context.permissionsByUserId.get(userId)
  return permissions ? { userId, permissions } : null
}

const filterEligibleOnline = (
  context: RingContext,
  candidateUserIds: readonly string[],
): readonly string[] => {
  const candidates = new Set(candidateUserIds)
  return context.onlineUserIds.filter((userId) => {
    if (!candidates.has(userId)) {
      return false
    }
    const member = memberOrNull(context, userId)
    return member
      ? isEligibleForConversationCall(member, context.conversation)
      : false
  })
}

/**
 * Tier 1 — the conversation's individually assigned agent, only while online
 * and eligible. Offline or ineligible falls through to the next tier rather
 * than ringing nobody.
 */
const assigneeTier: RingTier = {
  name: "assignee",
  resolve: (context) => {
    const assignedUserId = context.conversation?.assignedUserId
    if (!assignedUserId) {
      return []
    }
    return filterEligibleOnline(context, [assignedUserId])
  },
}

/**
 * Tier 2 — online, eligible members of the conversation's assigned team. Only
 * reached for a team-assigned conversation; a member whose only qualifying
 * permission is onlyAssignedContacts is never eligible here, resolved by the
 * same shared predicate used everywhere else.
 */
const assignedTeamTier: RingTier = {
  name: "assignedTeam",
  resolve: (context) => {
    if (!context.conversation?.assignedInboxTeamId) {
      return []
    }
    return filterEligibleOnline(context, context.teamMemberUserIds)
  },
}

/** Tier 3 — every online, eligible member (no assignee/team match). */
const eligibleOnlineTier: RingTier = {
  name: "eligibleOnline",
  resolve: (context) => filterEligibleOnline(context, context.onlineUserIds),
}

/**
 * Ordered ring-tier strategy array — the first tier that resolves at least one
 * candidate wins; later tiers are never consulted. A new tier is a one-line
 * splice here.
 */
export const RING_TIERS: readonly RingTier[] = [
  assigneeTier,
  assignedTeamTier,
  eligibleOnlineTier,
]

export type RingTargetsSelection = {
  tier: RingTierName | null
  userIds: readonly string[]
}

/**
 * Pure selection over a pre-built RingContext: the first non-empty tier in
 * RING_TIERS wins (presence order preserved), then MAX_VOIP_RING_TARGETS is
 * applied last, after tier resolution and eligibility filtering, so ineligible
 * online members can never hide an eligible one within the winning tier.
 * Returns { tier: null, userIds: [] } when every tier is empty.
 */
export function selectRingTargets(context: RingContext): RingTargetsSelection {
  for (const tier of RING_TIERS) {
    const userIds = tier.resolve(context)
    if (userIds.length > 0) {
      return {
        tier: tier.name,
        userIds: userIds.slice(0, MAX_VOIP_RING_TARGETS),
      }
    }
  }
  return { tier: null, userIds: [] }
}
