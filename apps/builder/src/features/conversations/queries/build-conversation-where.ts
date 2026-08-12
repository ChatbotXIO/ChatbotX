import { sql } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  applyContactFilter,
  buildSmartKeywordWhere,
  parseConversationAssigneeValues,
  pruneEmailPhoneFilterConditions,
  UNASSIGNED_ASSIGNEE_VALUE,
} from "@chatbotx.io/database/queries"
import type { ListConversationsRequest } from "@/features/conversations/schema/query"

type ConversationCursor = {
  lastActivityAt: Date | null
  id: string
}

type BuildConversationWhereOptions = {
  includeEmailAndPhone?: boolean
}

type QueryWhere = Record<string, unknown>

const isQueryWhere = (value: unknown): value is QueryWhere =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const hasWhereParts = (where: QueryWhere): boolean =>
  Object.keys(where).length > 0

const getAndParts = (where: QueryWhere): QueryWhere[] => {
  if (Object.keys(where).length === 1 && Array.isArray(where.AND)) {
    return where.AND.filter(isQueryWhere)
  }

  return [where]
}

const addContactWhere = (where: QueryWhere, contactWhere: QueryWhere): void => {
  if (!hasWhereParts(contactWhere)) {
    return
  }

  const currentContactWhere = isQueryWhere(where.contact)
    ? where.contact
    : undefined
  if (!(currentContactWhere && hasWhereParts(currentContactWhere))) {
    where.contact = contactWhere
    return
  }

  where.contact = {
    AND: [...getAndParts(currentContactWhere), ...getAndParts(contactWhere)],
  }
}

export function buildConversationWhere(
  workspaceId: string,
  input: Omit<ListConversationsRequest, "workspaceId">,
  cursor: ConversationCursor | null,
  options: BuildConversationWhereOptions = {},
): QueryWhere {
  const tags = input.tags ?? []
  const isArchiveView = tags.includes("archived")

  const where: Record<string, unknown> = {
    workspaceId,
  }

  if (!isArchiveView) {
    where.archivedAt = { isNull: true }
  }

  if (!tags.includes("blocked")) {
    where.contact = { blockedAt: { isNull: true } }
  }

  // ── Cursor condition ──────────────────────────────────────────────────────
  if (cursor) {
    where.OR = cursor.lastActivityAt
      ? [
          { lastActivityAt: { lt: cursor.lastActivityAt } },
          { lastActivityAt: { isNull: true } },
          {
            lastActivityAt: cursor.lastActivityAt,
            id: { lt: cursor.id },
          },
        ]
      : [
          {
            lastActivityAt: { isNull: true },
            id: { lt: cursor.id },
          },
        ]
  }

  // ── botCategory ──────────────────────────────────────────────────────────
  if (input.botCategory) {
    if (input.botCategory === "bot") {
      where.botEnabled = true
    } else if (input.botCategory === "human") {
      where.botEnabled = false
    }
  }

  // ── botEnabled (explicit boolean override) ───────────────────────────────
  if (input.botEnabled !== null && input.botEnabled !== undefined) {
    where.botEnabled = input.botEnabled
  }

  // ── assignedId ───────────────────────────────────────────────────────────
  if (input.assignedId !== null && input.assignedId !== undefined) {
    const assignedSelection = parseConversationAssigneeValues([
      input.assignedId,
    ])

    if (input.assignedId === UNASSIGNED_ASSIGNEE_VALUE) {
      where.assignedUserId = { isNull: true }
      where.assignedInboxTeamId = { isNull: true }
    } else if (assignedSelection.userIds[0]) {
      where.assignedUserId = assignedSelection.userIds[0]
    } else if (assignedSelection.inboxTeamIds[0]) {
      where.assignedInboxTeamId = assignedSelection.inboxTeamIds[0]
    }
  }

  // ── channel (via contactInboxes relation) ────────────────────────────────
  // "omnichannel" is a UI-only sentinel meaning "no channel restriction" —
  // it is never a real value stored on contactInboxes.channel.
  if (input.channel && input.channel !== channelTypes.enum.omnichannel) {
    where.contactInboxes = { channel: input.channel }
  }

  // ── keyword (smart contact search, including sourceId) ───────────────────
  if (input.keyword) {
    addContactWhere(
      where,
      buildSmartKeywordWhere(input.keyword, {
        includeEmailAndPhone: options.includeEmailAndPhone !== false,
      }),
    )
  }

  // ── tags ──────────────────────────────────────────────────────────────────
  if (tags.includes("noAdminReply")) {
    where.contactRepliedAt = { gt: sql`"adminRepliedAt"` }
  }
  if (tags.includes("unread")) {
    where.lastActivityAt = {
      ...(typeof where.lastActivityAt === "object" &&
      where.lastActivityAt !== null
        ? where.lastActivityAt
        : {}),
      gt: sql`"agentLastReadAt"`,
    }
  }
  if (tags.includes("followUp")) {
    where.followed = true
  }
  if (tags.includes("archived")) {
    where.archivedAt = { isNotNull: true }
  }
  if (tags.includes("blocked")) {
    addContactWhere(where, { blockedAt: { isNotNull: true } })
  }

  // ── contactFilter (complex filter builder) ───────────────────────────────
  const contactFilter = pruneEmailPhoneFilterConditions(
    input.contactFilter,
    options.includeEmailAndPhone !== false,
  )
  if (contactFilter) {
    const contactFilterWhere = applyContactFilter(contactFilter, workspaceId)
    if (Object.keys(contactFilterWhere).length > 0) {
      addContactWhere(where, contactFilterWhere)
    }
  }

  return where
}
