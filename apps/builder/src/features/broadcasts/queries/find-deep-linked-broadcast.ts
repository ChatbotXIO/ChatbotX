import { broadcastService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isPositiveBigint } from "@chatbotx.io/database/partials"
import type { BroadcastResourceWithRelations } from "../schema/resource"

/**
 * The broadcast a `?broadcastId=` link points at, or null when the id is not a
 * broadcast of this workspace (malformed, deleted or from another workspace).
 * Only a numeric id is looked up: the service also resolves a broadcast by
 * name, and a link must never do that.
 */
export async function findDeepLinkedBroadcast(input: {
  workspaceId: string
  broadcastId: string
}): Promise<BroadcastResourceWithRelations | null> {
  if (!isPositiveBigint(input.broadcastId)) {
    return null
  }
  try {
    return await broadcastService.findByIdOrName({
      workspaceId: input.workspaceId,
      idOrName: input.broadcastId,
    })
  } catch (error) {
    if (error instanceof ChatbotXException && error.httpStatusCode === 404) {
      return null
    }
    throw error
  }
}
