import { and, db, eq, findOrFail, sql } from "@chatbotx.io/database/client"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import { inArray } from "drizzle-orm"

export function findMessengerIntegrationByInboxId(inboxId: string) {
  return findOrFail({ table: integrationMessengerModel, where: { inboxId } })
}

export function findMessengerIntegrationByIdForWorkspace(props: {
  id: string
  workspaceId: string
}) {
  return db.query.integrationMessengerModel.findFirst({
    where: { id: props.id, workspaceId: props.workspaceId },
  })
}

/**
 * Replace the stored OAuth credentials after an OAuth reconnect. Scoped by
 * workspace so a forged integration id can never touch another tenant's row.
 */
export async function updateMessengerIntegrationAuth(props: {
  id: string
  workspaceId: string
  auth: Record<string, unknown>
  name?: string
}): Promise<void> {
  await db
    .update(integrationMessengerModel)
    .set({ auth: props.auth, ...(props.name ? { name: props.name } : {}) })
    .where(
      and(
        eq(integrationMessengerModel.id, props.id),
        eq(integrationMessengerModel.workspaceId, props.workspaceId),
      ),
    )
}

export function findMessengerIntegrationsByWorkspaceId(workspaceId: string) {
  return db.query.integrationMessengerModel.findMany({
    where: { workspaceId },
  })
}

/**
 * Page ids from the given list that already have a Messenger integration.
 * `IntegrationMessenger.pageId` is unique platform-wide, so a match means the
 * page cannot be connected again anywhere.
 */
export async function findConnectedMessengerPageIds(
  pageIds: string[],
): Promise<string[]> {
  if (pageIds.length === 0) {
    return []
  }

  const rows = await db
    .select({ pageId: integrationMessengerModel.pageId })
    .from(integrationMessengerModel)
    .where(inArray(integrationMessengerModel.pageId, pageIds))

  return rows.map((row) => row.pageId)
}

/**
 * Whether a Messenger integration still exists for a Facebook page under a
 * specific Meta app (`clientId`). Cross-workspace by design: the page webhook
 * subscription is global, so a surviving row must block a sibling channel from
 * unsubscribing it.
 */
export async function messengerIntegrationExistsForPage(props: {
  pageId: string
  clientId: string
}): Promise<boolean> {
  const rows = await db
    .select({ id: integrationMessengerModel.id })
    .from(integrationMessengerModel)
    .where(
      and(
        eq(integrationMessengerModel.pageId, props.pageId),
        sql`${integrationMessengerModel.auth} ->> 'clientId' = ${props.clientId}`,
      ),
    )
    .limit(1)

  return rows.length > 0
}
