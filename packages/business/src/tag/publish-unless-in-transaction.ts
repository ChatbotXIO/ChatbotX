import type { DatabaseClient } from "@chatbotx.io/database/client"
import { publishContactTagsChanged } from "./realtime"

/**
 * Publishes `contactTagsChanged` for the links a write changed, unless the
 * caller owns the transaction: it has not committed yet, so that caller
 * publishes (`publishContactTagsChanged`) once it has. An empty id list
 * publishes nothing.
 */
export const publishUnlessInTransaction = async (
  tx: DatabaseClient | undefined,
  workspaceId: string,
  contactIds: readonly string[],
): Promise<void> => {
  if (tx) {
    return
  }
  await publishContactTagsChanged({ workspaceId, contactIds })
}
