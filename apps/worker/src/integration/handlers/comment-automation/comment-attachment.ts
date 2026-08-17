import { buildContext } from "@chatbotx.io/business"
import type { FBCommentHideComments } from "@chatbotx.io/database/partials"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import type { AuthValue } from "@chatbotx.io/sdk"
import { allIntegrations } from "../../../services/integrations"
import type { CommentAutomationChannelType } from "./channel-type"

export type CommentAttachmentInfo = {
  hasImage: boolean
  hasVideo: boolean
}

export function needsAttachmentInfo(
  hideComments: FBCommentHideComments,
): boolean {
  return hideComments.hasImage || hideComments.hasVideo
}

/**
 * Returns a memoized resolver that fetches a comment's attachment type at
 * most once per incoming comment, regardless of how many active automations
 * need it. Instagram has no attachment-lookup API yet, so non-messenger
 * channels short-circuit to "no attachment" — unrelated to which channels
 * support private replies.
 */
export function createAttachmentInfoResolver(params: {
  channelType: CommentAutomationChannelType
  workspaceId: string
  commentId: string
  integrationRow: {
    id: string
    auth: AuthValue
    inboxId: string
    [x: string]: unknown
  }
  auth: MessengerAuthValue
}): () => Promise<CommentAttachmentInfo> {
  const { channelType, workspaceId, commentId, integrationRow, auth } = params
  let cached: CommentAttachmentInfo | undefined

  return async () => {
    if (cached) {
      return cached
    }
    if (channelType !== "messenger") {
      cached = { hasImage: false, hasVideo: false }
      return cached
    }
    const type = await allIntegrations.messenger
      ?.runAction("getCommentAttachmentType", {
        ctx: await buildContext({
          workspaceId,
          integrationType: "messenger",
          integration: { ...integrationRow, auth },
        }),
        input: { commentId },
      })
      .catch(() => null)
    cached = {
      hasImage: type === "photo",
      hasVideo: type === "video_inline",
    }
    return cached
  }
}
