import { CHANNEL_POST_SYNC_NOT_CONNECTED } from "@chatbotx.io/database/partials"
import { inboxStatuses } from "@chatbotx.io/utils/conversation"
import { z } from "zod"

/** What the person can do about a failed sync. */
export const syncFailureActions = z.enum([
  "reconnect",
  "reconnectWithPermission",
  "retry",
])
export type SyncFailureAction = z.infer<typeof syncFailureActions>

type SyncStatusItem = {
  inboxId: string
  inboxName: string
  lastErrorCategory: string | null
  status: string
}

type InboxConnection = { id: string; status: string }

export type SyncFailure<Item extends SyncStatusItem> = Item & {
  action: SyncFailureAction
}

/** `auth_failed` -> reconnect, `permission_denied` -> reconnect and allow, anything else -> retry. */
export const syncFailureAction = (
  category: string | null,
): SyncFailureAction => {
  if (category === "auth_failed") {
    return syncFailureActions.enum.reconnect
  }
  if (category === "permission_denied") {
    return syncFailureActions.enum.reconnectWithPermission
  }
  return syncFailureActions.enum.retry
}

/**
 * The syncs that really failed. The status list already holds only inboxes
 * that can sync (connected with an integration); this also drops anything that
 * is not a terminal failure (`notConnected`, queued, idle) or whose inbox is
 * not connected as far as the inbox list knows. Each failure carries the
 * action to offer. The result keeps the status list's order.
 */
export const failedConnectedSyncs = <Item extends SyncStatusItem>(
  items: Item[],
  inboxes: InboxConnection[],
): SyncFailure<Item>[] => {
  const connected = new Set(
    inboxes
      .filter((inbox) => inbox.status === inboxStatuses.enum.connected)
      .map((inbox) => inbox.id),
  )
  return items
    .filter(
      (item) =>
        item.status === "failed" &&
        item.lastErrorCategory !== CHANNEL_POST_SYNC_NOT_CONNECTED &&
        connected.has(item.inboxId),
    )
    .map((item) => ({
      ...item,
      action: syncFailureAction(item.lastErrorCategory),
    }))
}
