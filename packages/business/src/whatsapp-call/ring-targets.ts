import {
  hasWorkspacePermission,
  type PermissionsInput,
} from "../workspace-member/permissions"

/**
 * Cap on how many agents a single inbound VoIP call fans out to — a bounded
 * "ring a bounded set" discipline so a huge workspace can't fork one call to
 * hundreds of browsers. Applied AFTER tier resolution and eligibility
 * filtering (never before), so an ineligible online member can never push
 * an eligible one out of the cap. Re-exported from `voip-call-service.ts`
 * for existing callers/tests.
 */
export const MAX_VOIP_RING_TARGETS = 10

/** A conversation's assignment, as far as ring-eligibility and ring-tier
 * selection cares — `null` when the conversation itself could not be
 * resolved (e.g. deleted between `handleConnect` resolving `conversationId`
 * and this lookup running). */
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
 * Ordered rule array (`some`), evaluated top to bottom — encodes plan D3
 * exactly: `superAdmin || contacts || (onlyAssignedContacts && individually
 * assigned to them)`. `onlyAssignedContacts` alone is NEVER enough — a
 * member with only that flag is eligible only when
 * `conversation.assignedUserId` is literally their own id (D2: a
 * team-assigned-but-not-individually-assigned conversation does not count,
 * and neither does an unassigned one — no auto-claim by ringing). Reuses
 * `hasWorkspacePermission` for every permission check rather than a
 * parallel `=== true` read. The single predicate shared by ringing,
 * pickup, resume, TURN and call reads (`call-access-service.ts`, P2 Part B).
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
 * Everything a tier needs to resolve its candidate user ids — built once
 * per inbound call by the business-layer orchestration
 * (`whatsappVoipCallService.selectRingTargetsForCall`) and passed to every
 * tier in {@link RING_TIERS} unchanged.
 */
export type RingContext = {
  conversation: RingConversation
  /** Online member user ids, presence order (most-recently-renewed tab
   * first), already deduped — see `workspacePresenceService.listOnlineMembers`. */
  onlineUserIds: readonly string[]
  /** Permissions for online user ids ONLY (bounded projection) — a userId
   * with no entry (e.g. a synthetic support-session membership, which is
   * never persisted, or simply not yet loaded) is excluded by construction. */
  permissionsByUserId: ReadonlyMap<string, PermissionsInput>
  /** User ids belonging to `conversation.assignedInboxTeamId` — empty when
   * the conversation has no assigned team (the orchestration only loads
   * this projection when `assignedInboxTeamId` is set). */
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
 * Tier 1 — the conversation's individually assigned agent, ONLY while they
 * are online AND eligible. D1: offline (or ineligible) falls through to the
 * next tier rather than ringing nobody.
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
 * Tier 2 — online, eligible members of the conversation's assigned team.
 * D2: only reached for a team-assigned conversation; a member whose ONLY
 * qualifying permission is `onlyAssignedContacts` is never eligible here
 * (they are not individually assigned), resolved by the shared predicate
 * exactly as it is everywhere else — no parallel rule.
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
 * Ordered ring-tier strategy array — the first tier that resolves at least
 * one candidate wins; later tiers are never consulted. No if-else chain:
 * a new tier is a one-line splice here.
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
 * Pure selection over a pre-built {@link RingContext}: the first non-empty
 * tier in {@link RING_TIERS} wins (presence order preserved within it), then
 * {@link MAX_VOIP_RING_TARGETS} is applied LAST — after tier resolution and
 * eligibility filtering, never before, so a large number of ineligible
 * online members can never hide an eligible one within the winning tier.
 * Returns `{ tier: null, userIds: [] }` when every tier is empty (nobody to
 * ring).
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
