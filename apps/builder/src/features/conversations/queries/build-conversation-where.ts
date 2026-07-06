import { sql } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { applyContactFilter } from "@chatbotx.io/database/queries"
import { parseBigIntId } from "@chatbotx.io/utils"
import type { ListConversationsRequest } from "@/features/conversations/schema/query"

type ConversationCursor = {
  lastActivityAt: Date | null
  id: string
}

export function buildConversationWhere(
  workspaceId: string,
  input: Omit<ListConversationsRequest, "workspaceId">,
  cursor: ConversationCursor | null,
): Record<string, unknown> {
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
    if (input.assignedId === "unassigned") {
      where.assignedUserId = { isNull: true }
      where.assignedInboxTeamId = { isNull: true }
    } else if (input.assignedId.startsWith("u_")) {
      const userId = parseBigIntId(input.assignedId.slice(2))
      if (userId) {
        where.assignedUserId = userId
      }
    } else if (input.assignedId.startsWith("t_")) {
      const inboxTeamId = parseBigIntId(input.assignedId.slice(2))
      if (inboxTeamId) {
        where.assignedInboxTeamId = inboxTeamId
      }
    }
  }

  // ── channel (via contactInboxes relation) ────────────────────────────────
  // "omnichannel" is a UI-only sentinel meaning "no channel restriction" —
  // it is never a real value stored on contactInboxes.channel.
  if (input.channel && input.channel !== channelTypes.enum.omnichannel) {
    where.contactInboxes = { channel: input.channel }
  }

  // ── keyword (contact firstName / lastName ILIKE) ─────────────────────────
  if (input.keyword) {
    const keyword = input.keyword.toLowerCase()
    where.contact = {
      ...(typeof where.contact === "object" && where.contact !== null
        ? where.contact
        : {}),
      OR: [
        { firstName: { ilike: `%${keyword}%` } },
        { lastName: { ilike: `%${keyword}%` } },
      ],
    }
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
    where.contact = {
      ...(typeof where.contact === "object" && where.contact !== null
        ? where.contact
        : {}),
      blockedAt: { isNotNull: true },
    }
  }

  // ── contactFilter (complex filter builder) ───────────────────────────────
  if (input.contactFilter) {
    const contactFilterWhere = applyContactFilter(input.contactFilter)
    if (Object.keys(contactFilterWhere).length > 0) {
      where.contact = {
        ...(typeof where.contact === "object" && where.contact !== null
          ? where.contact
          : {}),
        ...contactFilterWhere,
      }
    }
  }

  return where
}
