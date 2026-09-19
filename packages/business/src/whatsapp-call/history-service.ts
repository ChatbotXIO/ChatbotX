import {
  resolveDisplayCallOutcome,
  type WhatsappCallDirection,
  type WhatsappCallOutcome,
  type WhatsappCallStatus,
} from "@chatbotx.io/database/partials"
import {
  type WhatsappCallHistoryScope,
  type WhatsappCallListCursor,
  type WhatsappCallListFilters,
  type WhatsappCallListRow,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import {
  hasWorkspacePermission,
  type PermissionsInput,
} from "../workspace-member/permissions"
import { isCallHistoryAdmin } from "./call-access-service"

/** Reference page size for the call log. */
export const CALL_HISTORY_PAGE_SIZE = 25

/**
 * The Calls page's kind badge, matched in first-match order. `ongoing` is
 * checked first since a non-terminal row has no display outcome; `completed`
 * splits into answeredInbound/answeredOutbound by direction.
 */
export type WhatsappCallKind =
  | "ongoing"
  | "canceled"
  | "declined"
  | "missed"
  | "unanswered"
  | "answeredInbound"
  | "answeredOutbound"

type CallKindRow = {
  status: WhatsappCallStatus
  outcome: WhatsappCallOutcome | null
  direction: WhatsappCallDirection
}

type CallKindRule = {
  readonly kind: WhatsappCallKind
  readonly matches: (row: CallKindRow) => boolean
}

const NON_TERMINAL_STATUSES: readonly WhatsappCallStatus[] = [
  "ringing",
  "accepted",
]

/**
 * Ordered strategy array, evaluated top to bottom — first match wins, like
 * CALL_ELIGIBILITY_RULES/RING_TIERS. A new kind is a one-line splice here,
 * never an added if.
 */
export const CALL_KIND_RULES: readonly CallKindRule[] = [
  {
    kind: "ongoing",
    matches: (row) => NON_TERMINAL_STATUSES.includes(row.status),
  },
  {
    kind: "canceled",
    matches: (row) => resolveDisplayCallOutcome(row) === "canceled",
  },
  {
    kind: "declined",
    matches: (row) => resolveDisplayCallOutcome(row) === "rejected",
  },
  {
    kind: "missed",
    matches: (row) =>
      resolveDisplayCallOutcome(row) === "failed" &&
      row.direction === "userInitiated",
  },
  {
    kind: "unanswered",
    matches: (row) =>
      resolveDisplayCallOutcome(row) === "failed" &&
      row.direction === "businessInitiated",
  },
  {
    kind: "answeredInbound",
    matches: (row) =>
      resolveDisplayCallOutcome(row) === "completed" &&
      row.direction === "userInitiated",
  },
  {
    kind: "answeredOutbound",
    matches: (row) =>
      resolveDisplayCallOutcome(row) === "completed" &&
      row.direction === "businessInitiated",
  },
]

/**
 * null only when a future status/outcome combination outruns the rule table —
 * never for any value in today's domain.
 */
export function resolveCallKind(row: CallKindRow): WhatsappCallKind | null {
  return CALL_KIND_RULES.find((rule) => rule.matches(row))?.kind ?? null
}

/**
 * The Calls page's base activity chips. Each chip maps to a typed, low-level
 * filter the repository's where-builder understands directly — never a raw SQL
 * fragment, so the mapping stays testable in isolation from the query.
 */
export type WhatsappCallActivityChip = "missed" | "noReply"

export const CALL_ACTIVITY_FILTERS: Record<
  WhatsappCallActivityChip,
  WhatsappCallListFilters
> = {
  missed: { outcome: "failed", direction: "userInitiated" },
  noReply: { outcome: "failed", direction: "businessInitiated" },
}

type HistoryScopeRule = {
  readonly matches: (permissions: PermissionsInput) => boolean
  readonly resolve: (userId: string) => WhatsappCallHistoryScope
}

/**
 * First match wins: superAdmin/analytics see all calls, contacts see their own,
 * onlyAssignedContacts only their assigned conversations.
 */
const HISTORY_SCOPE_RULES: readonly HistoryScopeRule[] = [
  {
    matches: isCallHistoryAdmin,
    resolve: () => ({ allCalls: true }),
  },
  {
    matches: (permissions) => hasWorkspacePermission(permissions, "contacts"),
    resolve: (userId) => ({ allCalls: false, userId, assignedOnly: false }),
  },
  {
    matches: (permissions) =>
      hasWorkspacePermission(permissions, "onlyAssignedContacts"),
    resolve: (userId) => ({ allCalls: false, userId, assignedOnly: true }),
  },
]

/**
 * null is the defense-in-depth path when no rule matches — must fail closed
 * (empty result, never touching the repository), not fall back to a real
 * scoped query the member holds no permission for.
 */
function resolveHistoryScope(member: {
  userId: string
  permissions: PermissionsInput
}): WhatsappCallHistoryScope | null {
  const rule = HISTORY_SCOPE_RULES.find((candidate) =>
    candidate.matches(member.permissions),
  )
  return rule ? rule.resolve(member.userId) : null
}

export type WhatsappCallHistoryRow = WhatsappCallListRow & {
  kind: WhatsappCallKind | null
}

export type WhatsappCallHistoryListInput = {
  workspaceId: string
  member: { userId: string; permissions: PermissionsInput }
  activity?: WhatsappCallActivityChip
  direction?: WhatsappCallDirection
  inboxId?: string
  /**
   * Ignored unless the resolved scope is allCalls (agent filter only for
   * superAdmin/analytics).
   */
  agentUserId?: string
  cursor?: WhatsappCallListCursor
  limit?: number
}

export type WhatsappCallHistoryListResult = {
  data: WhatsappCallHistoryRow[]
  nextCursor: WhatsappCallListCursor | null
}

async function list(
  input: WhatsappCallHistoryListInput,
): Promise<WhatsappCallHistoryListResult> {
  const scope = resolveHistoryScope(input.member)
  // Fail closed — a member with none of the four scope-granting permissions
  // gets an empty page, never a repository read.
  if (!scope) {
    return { data: [], nextCursor: null }
  }
  const limit = input.limit ?? CALL_HISTORY_PAGE_SIZE
  const chipFilters = input.activity
    ? CALL_ACTIVITY_FILTERS[input.activity]
    : {}

  const filters: WhatsappCallListFilters = {
    ...chipFilters,
    // An active chip's direction always wins — an explicit direction input is
    // only applied when no chip is active. A chip like missed already implies
    // its own direction; an explicit businessInitiated alongside it would
    // silently produce an impossible/empty combination instead of the chip's
    // intended result.
    direction: chipFilters.direction ?? input.direction,
    inboxId: input.inboxId,
    // agentUserId is dropped for a non-admin scope one line down, at the
    // repository, which only honours it when scope.allCalls — never silently
    // applied twice.
    agentUserId: input.agentUserId,
  }

  const rows = await whatsappCallRepository.listForWorkspace({
    workspaceId: input.workspaceId,
    scope,
    filters,
    cursor: input.cursor,
    limit: limit + 1,
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const lastRow = page.at(-1)

  return {
    data: page.map((row) => ({
      ...row,
      kind: resolveCallKind({
        status: row.status,
        outcome: row.outcome,
        direction: row.direction,
      }),
    })),
    // The next cursor's createdAt is the row's full-precision TEXT rendering
    // (createdAtCursor), never the JS Date on createdAt itself — see
    // WhatsappCallListCursor's doc comment.
    nextCursor:
      hasMore && lastRow
        ? { createdAt: lastRow.createdAtCursor, id: lastRow.id }
        : null,
  }
}

export const whatsappCallHistoryService = { list }
