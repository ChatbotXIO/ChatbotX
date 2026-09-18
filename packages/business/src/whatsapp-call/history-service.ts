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

/** Reference page size for the call log — see plan P5 item 4. */
export const CALL_HISTORY_PAGE_SIZE = 25

/**
 * P5 item 5 (plan D9) — the Calls page's six-plus-one kind badge, matched
 * against an already-loaded row (never against SQL) in first-match order.
 * `ongoing` is checked before any outcome read since a non-terminal row has
 * no display outcome at all. The four terminal, non-`completed` kinds share
 * their i18n label with the in-conversation card
 * (`resolveWhatsappCallActivityLabelKey`) — `resolveCallKind` deliberately
 * returns the exact same domain (`WhatsappCallOutcome`, minus `completed`)
 * so a caller can feed it straight into that function; `completed` splits
 * into `answeredInbound`/`answeredOutbound` (the card never needs this
 * split — it always knows its own direction already).
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
 * Ordered strategy array (`find`), evaluated top to bottom — first match
 * wins, exactly like {@link CALL_ELIGIBILITY_RULES}/`RING_TIERS`. A new kind
 * is a one-line splice here, never an added `if`.
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

/** `null` only when a future status/outcome combination outruns the rule table — never for any value in today's domain. */
export function resolveCallKind(row: CallKindRow): WhatsappCallKind | null {
  return CALL_KIND_RULES.find((rule) => rule.matches(row))?.kind ?? null
}

/**
 * P5 item 5 (plan D9) — the Calls page's base activity chips. Each chip
 * maps to a typed, low-level filter the repository's where-builder
 * understands directly (`WhatsappCallListFilters`) — never a raw SQL
 * fragment, so the chip → filter mapping stays testable in isolation from
 * the query.
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
 * Ordered strategy array translating plan D4 into a
 * {@link WhatsappCallHistoryScope} the repository consumes directly — the
 * SAME three-way split `isEligibleForConversationCall` encodes for D3
 * (superAdmin/analytics unrestricted, `contacts` restricted to own calls,
 * `onlyAssignedContacts` further restricted to individually assigned
 * conversations), translated once here instead of duplicated per caller.
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
 * A member reaching this service is EXPECTED to have already passed the
 * page-level gate (`hasContactsAccess || analytics`), so one of the three
 * rules should always match. `null` is the defense-in-depth path for when
 * it doesn't (a caller that bypasses the page gate, or a permission that
 * changed mid-session) — L2 fix: this MUST fail closed (an empty result,
 * never touching the repository), not silently fall back to the most
 * restrictive real scope (`assignedOnly: true`), which would still run a
 * real, non-empty query scoped to the member's own `userId` even though
 * they hold none of the four permissions ({@link isCallHistoryAdmin}'s two,
 * plus `contacts`/`onlyAssignedContacts`) that grant ANY read access here.
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
  /** Ignored unless the resolved scope is `allCalls` (D4: "Agent filter only for superAdmin/analytics"). */
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
  // L2: fail closed — a member with none of the four scope-granting
  // permissions gets an empty page, never a repository read.
  if (!scope) {
    return { data: [], nextCursor: null }
  }
  const limit = input.limit ?? CALL_HISTORY_PAGE_SIZE
  const chipFilters = input.activity
    ? CALL_ACTIVITY_FILTERS[input.activity]
    : {}

  const filters: WhatsappCallListFilters = {
    ...chipFilters,
    // L1: an active chip's direction always wins — an explicit `direction`
    // input is only applied when NO chip is active. A chip like `missed`
    // already implies its own direction (`userInitiated`); an explicit
    // `businessInitiated` alongside it would silently produce an
    // impossible/empty combination instead of the chip's intended result.
    direction: chipFilters.direction ?? input.direction,
    inboxId: input.inboxId,
    // `agentUserId` is dropped for a non-admin scope one line down, at the
    // repository, which only honours it when `scope.allCalls` — never
    // silently applied twice.
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
    // H1: the next cursor's `createdAt` is the row's full-precision TEXT
    // rendering (`createdAtCursor`), never the JS `Date` on `createdAt`
    // itself — see `WhatsappCallListCursor`'s doc comment.
    nextCursor:
      hasMore && lastRow
        ? { createdAt: lastRow.createdAtCursor, id: lastRow.id }
        : null,
  }
}

export const whatsappCallHistoryService = { list }
