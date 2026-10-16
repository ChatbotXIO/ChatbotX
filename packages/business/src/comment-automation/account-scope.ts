import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { CommentAutomationType } from "@chatbotx.io/database/partials"
import { validationException } from "../errors"

/**
 * One connected account a comment or story automation can be scoped to. The
 * id is the account's `Inbox.id` — what `CommentAutomation.inboxId` and
 * `IgStoryAutomation.inboxId` store, and what every incoming comment already
 * carries through its integration row.
 */
export type AutomationAccount = {
  inboxId: string
  name: string
}

/**
 * The accounts of one automation channel connected to the workspace.
 *
 * Read from the integration tables rather than `Inbox.channel`, because
 * `Inbox.channel` is `instagram` for BOTH Instagram connections: only
 * `IntegrationInstagram.type` tells an Instagram Login account (`instagram`)
 * from one connected through Facebook Login (`facebook` ↔ `instagramFacebook`),
 * and an automation of one type never sees the other's comments.
 */
export async function listAutomationAccounts(props: {
  workspaceId: string
  type: CommentAutomationType
  tx?: DatabaseClient
}): Promise<AutomationAccount[]> {
  const { workspaceId, type, tx = db } = props
  const columns = { inboxId: true, name: true } as const

  switch (type) {
    case "messenger":
      return await tx.query.integrationMessengerModel.findMany({
        where: { workspaceId },
        columns,
      })
    case "instagram":
    case "instagramFacebook":
      return await tx.query.integrationInstagramModel.findMany({
        where: {
          workspaceId,
          type: type === "instagramFacebook" ? "facebook" : "instagram",
        },
        columns,
      })
    case "threads":
      return await tx.query.integrationThreadsModel.findMany({
        where: { workspaceId },
        columns,
      })
    case "tiktok":
      return await tx.query.integrationTiktokModel.findMany({
        where: { workspaceId },
        columns,
      })
    default:
      return type satisfies never
  }
}

/**
 * Rejects an `inboxId` that is not an account of this automation's channel in
 * this workspace. `null`/`undefined` pass: `null` is "every account" and
 * `undefined` is "not part of this update".
 *
 * Without it a public-API or MCP caller could save another workspace's inbox,
 * or a Page id on an Instagram automation — a scope that matches no incoming
 * comment, so the automation goes silent with no error anywhere.
 *
 * An update that re-sends the stored scope (`currentInboxId`) passes without a
 * lookup. Disconnecting a channel deletes its integration row but keeps the
 * inbox, so a scope pointing at a disconnected account is no longer listed —
 * and every edit form sends the whole row back, so checking it again would
 * stop the user from even renaming or switching off that automation.
 */
export async function assertAutomationAccount(props: {
  workspaceId: string
  type: CommentAutomationType
  inboxId: string | null | undefined
  currentInboxId?: string | null
  tx?: DatabaseClient
}): Promise<void> {
  const { inboxId, currentInboxId } = props
  if (inboxId === null || inboxId === undefined) {
    return
  }
  if (inboxId === currentInboxId) {
    return
  }
  const accounts = await listAutomationAccounts(props)
  if (!accounts.some((account) => account.inboxId === inboxId)) {
    throw validationException(
      "inboxId",
      "The account is not connected to this workspace for this channel",
    )
  }
}
