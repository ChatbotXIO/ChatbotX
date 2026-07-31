import { and, db, eq, findOrFail, sql } from "@chatbotx.io/database/client"
import type { IntegrationUserInfo } from "@chatbotx.io/database/partials"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"

export function findInstagramIntegrationByInboxId(inboxId: string) {
  return findOrFail({ table: integrationInstagramModel, where: { inboxId } })
}

export function findInstagramIntegrationsByWorkspaceId(
  workspaceId: string,
  type?: "instagram" | "facebook",
) {
  return db.query.integrationInstagramModel.findMany({
    where: { workspaceId, ...(type ? { type } : {}) },
  })
}

export function findInstagramIntegrationByIdForWorkspace(props: {
  id: string
  workspaceId: string
}) {
  return db.query.integrationInstagramModel.findFirst({
    where: { id: props.id, workspaceId: props.workspaceId },
  })
}

/**
 * Replace the stored OAuth credentials after an OAuth reconnect. Scoped by
 * workspace so a forged integration id can never touch another tenant's row.
 * `pageId` may change on the Facebook-login variant when the Instagram account
 * has been re-linked to a different page (only `igId` is unique).
 */
export async function updateInstagramIntegrationAuth(props: {
  id: string
  workspaceId: string
  auth: Record<string, unknown>
  name?: string
  username?: string
  pageId?: string
  userInfo?: IntegrationUserInfo
}): Promise<void> {
  await db
    .update(integrationInstagramModel)
    .set({
      auth: props.auth,
      ...(props.name ? { name: props.name } : {}),
      ...(props.username ? { username: props.username } : {}),
      ...(props.pageId ? { pageId: props.pageId } : {}),
      ...(props.userInfo ? { userInfo: props.userInfo } : {}),
    })
    .where(
      and(
        eq(integrationInstagramModel.id, props.id),
        eq(integrationInstagramModel.workspaceId, props.workspaceId),
      ),
    )
}

/**
 * Store the authorizing user's identity after a connect. Separate from the
 * insert because the avatar upload is an external call that must stay outside
 * the connect transaction.
 */
export async function updateInstagramIntegrationUserInfo(props: {
  id: string
  workspaceId: string
  userInfo: IntegrationUserInfo
}): Promise<void> {
  await db
    .update(integrationInstagramModel)
    .set({ userInfo: props.userInfo })
    .where(
      and(
        eq(integrationInstagramModel.id, props.id),
        eq(integrationInstagramModel.workspaceId, props.workspaceId),
      ),
    )
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
