import { and, count, db, eq, ne, sql } from "@chatbotx.io/database/client"
import {
  contactModel,
  userQuotaModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { cacheConnections, distributedStore } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"

const LIVE_KEY_PREFIX = "user-quota-live:"

export const syncUserQuota = async (): Promise<void> => {
  const client = await cacheConnections.useExisting()

  // SCAN instead of KEYS to avoid blocking Redis on large key sets
  const userIds: string[] = []
  let cursor = "0"
  do {
    const [nextCursor, keys] = await client.scan(
      cursor,
      "MATCH",
      `${LIVE_KEY_PREFIX}*`,
      "COUNT",
      100,
    )
    cursor = nextCursor
    for (const key of keys) {
      userIds.push(key.slice(LIVE_KEY_PREFIX.length))
    }
  } while (cursor !== "0")

  if (userIds.length === 0) {
    return
  }

  logger.info({ count: userIds.length }, "user-quota: syncing quota for users")

  // Process in batches to avoid overwhelming the DB
  const BATCH_SIZE = 50
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(reconcileUser))
  }
}

const reconcileUser = async (userId: string): Promise<void> => {
  try {
    const client = await cacheConnections.useExisting()

    const [[contactsResult], [teamMembersResult]] = await Promise.all([
      db
        .select({ count: count() })
        .from(contactModel)
        .innerJoin(
          workspaceModel,
          eq(contactModel.workspaceId, workspaceModel.id),
        )
        .where(eq(workspaceModel.ownerId, userId)),

      db
        .select({ count: count() })
        .from(workspaceMemberModel)
        .innerJoin(
          workspaceModel,
          eq(workspaceMemberModel.workspaceId, workspaceModel.id),
        )
        .where(
          and(
            eq(workspaceModel.ownerId, userId),
            ne(workspaceMemberModel.role, "owner"),
          ),
        ),
    ])

    const contactsUsed = contactsResult?.count ?? 0
    const teamMembersUsed = teamMembersResult?.count ?? 0

    await db
      .insert(userQuotaModel)
      .values({
        userId,
        contactsUsed,
        teamMembersUsed,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userQuotaModel.userId,
        set: {
          contactsUsed: sql`GREATEST(${userQuotaModel.contactsUsed}, ${contactsUsed})`,
          teamMembersUsed: sql`GREATEST(${userQuotaModel.teamMembersUsed}, ${teamMembersUsed})`,
          syncedAt: new Date(),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })

    // Fetch the stored values after upsert so the live cache reflects the
    // cumulative high-water mark, not just the current DB count.
    const stored = await db.query.userQuotaModel.findFirst({
      where: { userId },
      columns: { contactsUsed: true, teamMembersUsed: true },
    })

    await client.hset(
      `${LIVE_KEY_PREFIX}${userId}`,
      "contacts",
      String(stored?.contactsUsed ?? contactsUsed),
      "teamMembers",
      String(stored?.teamMembersUsed ?? teamMembersUsed),
    )

    await distributedStore.delete(`user-quota:${userId}`)
  } catch (err) {
    logger.error({ err, userId }, "user-quota: failed to reconcile user quota")
  }
}
