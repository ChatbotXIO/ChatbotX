import { and, db, eq, findOrFail, sql } from "@chatbotx.io/database/client"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"

export function findInstagramIntegrationByInboxId(inboxId: string) {
  return findOrFail({ table: integrationInstagramModel, where: { inboxId } })
}

/**
 * Whether an Instagram integration still exists for a Facebook page, optionally
 * scoped to a specific Meta app (`clientId`). Cross-workspace by design: a page
 * webhook subscription is global, so any surviving row must block a sibling
 * channel from unsubscribing it.
 */
export async function instagramIntegrationExistsForPage(props: {
  pageId: string
  clientId?: string
}): Promise<boolean> {
  const rows = await db
    .select({ id: integrationInstagramModel.id })
    .from(integrationInstagramModel)
    .where(
      and(
        eq(integrationInstagramModel.pageId, props.pageId),
        props.clientId
          ? sql`${integrationInstagramModel.auth} ->> 'clientId' = ${props.clientId}`
          : undefined,
      ),
    )
    .limit(1)

  return rows.length > 0
}

export function instagramIntegrationExistsByPageId(
  pageId: string,
): Promise<boolean> {
  return instagramIntegrationExistsForPage({ pageId })
}
