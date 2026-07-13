import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import { inArray } from "drizzle-orm"

export function findMessengerIntegrationByInboxId(inboxId: string) {
  return findOrFail({ table: integrationMessengerModel, where: { inboxId } })
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
