import {
  and,
  db,
  eq,
  isNull,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { contactModel, conversationModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { applyContactFilter } from "../apply-contact-filter"
import type {
  ListContactsRequest,
  ListContactsResponse,
} from "../schemas/query"

// Drizzle relational query API não suporta filter aninhado cross-table no
// `where` (`conversation: { assignedUserId: X }` retorna "Unknown
// relational filter field"). Solução: pré-buscar IDs dos contatos que
// têm a conversation no assignment desejado e fazer `{ id: { in: [...] }}`.
async function resolveContactIdsByAssignment(
  workspaceId: string,
  assignedId: string,
): Promise<string[]> {
  const baseFilter = eq(conversationModel.workspaceId, workspaceId)
  const assignmentWhere = (() => {
    if (assignedId === "unassigned") {
      return and(
        baseFilter,
        isNull(conversationModel.assignedUserId),
        isNull(conversationModel.assignedInboxTeamId),
      )
    }
    if (assignedId.startsWith("u_")) {
      return and(
        baseFilter,
        eq(conversationModel.assignedUserId, assignedId.slice(2)),
      )
    }
    if (assignedId.startsWith("t_")) {
      return and(
        baseFilter,
        eq(conversationModel.assignedInboxTeamId, assignedId.slice(2)),
      )
    }
    return null
  })()
  if (!assignmentWhere) {
    return []
  }
  const rows = await db
    .select({ contactId: conversationModel.contactId })
    .from(conversationModel)
    .where(assignmentWhere)
  return rows.map((r) => r.contactId)
}

export async function listContacts(
  input: ListContactsRequest & { workspaceId: string },
): Promise<ListContactsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  let assignmentContactIds: string[] | undefined
  if (input.assignedId && input.assignedId !== "all") {
    assignmentContactIds = await resolveContactIdsByAssignment(
      input.workspaceId,
      input.assignedId,
    )
    if (assignmentContactIds.length === 0) {
      return { data: [], pageCount: 0 }
    }
  }

  const where = generateWhere(input, assignmentContactIds)

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(contactModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.contactModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        contactInboxes: true,
        tags: true,
        lifecycleStage: true,
        conversation: {
          with: {
            assignedUser: true,
            assignedInboxTeam: true,
            // inbox: true,
          },
        },
      },
    }),
    // biome-ignore lint/suspicious/noExplicitAny: relationsFilterToSQL requires typed Drizzle filter
    db.$count(contactModel, relationsFilterToSQL(contactModel, where as any)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}

export async function countContacts(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  if (!input.keyword) {
    return getTotalContactsFromStats(input.workspaceId)
  }

  const where = generateWhere(input)

  const total = await db.$count(
    contactModel,
    // biome-ignore lint/suspicious/noExplicitAny: relationsFilterToSQL requires typed Drizzle filter
    relationsFilterToSQL(contactModel, where as any),
  )
  return { total }
}

async function getTotalContactsFromStats(
  workspaceId: string,
): Promise<{ total: number }> {
  try {
    const inboxes = await db.query.inboxModel.findMany({
      where: { workspaceId },
      with: {
        contactStats: true,
      },
    })

    const total = inboxes.reduce(
      (sum, inbox) => sum + (inbox.contactStats?.totalContacts ?? 0),
      0,
    )

    return { total }
  } catch (error) {
    console.error("Error getting total contacts from stats:", error)
    return { total: 0 }
  }
}

const generateWhere = (
  input: ListContactsRequest,
  assignmentContactIds?: string[],
) => {
  const where: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    ...(input.keyword
      ? {
          OR: [
            { firstName: { ilike: `%${input.keyword.toLowerCase()}%` } },
            { lastName: { ilike: `%${input.keyword.toLowerCase()}%` } },
            { email: { ilike: `%${input.keyword.toLowerCase()}%` } },
            { phoneNumber: { ilike: `%${input.keyword.toLowerCase()}%` } },
          ],
        }
      : {}),
  }

  if (input.contactFilter) {
    Object.assign(where, applyContactFilter(input.contactFilter))
  }

  if (input.lifecycleStageIds && input.lifecycleStageIds.length > 0) {
    where.lifecycleStageId = { in: input.lifecycleStageIds }
  }

  // Filtro "Contatos bloqueados" (sidebar) — quando blocked=true mostra só
  // contatos com `blockedAt IS NOT NULL`; quando undefined/false, default
  // do schema do contact (todos visíveis incluindo bloqueados).
  if (input.blocked) {
    where.blockedAt = { isNotNull: true }
  }

  // Caixas/Times — IDs já resolvidos via resolveContactIdsByAssignment.
  if (assignmentContactIds && assignmentContactIds.length > 0) {
    where.id = { in: assignmentContactIds }
  }

  return where
}
