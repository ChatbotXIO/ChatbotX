import { buildContext } from "@chatbotx.io/business"
import type { CommentHideComments } from "@chatbotx.io/database/partials"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import type {
  ThreadsAuthValue,
  ThreadsReplyAttachment,
} from "@chatbotx.io/integration-threads"
import type { AuthValue } from "@chatbotx.io/sdk"
import { allIntegrations } from "../../../services/integrations"
import type { CommentAutomationChannelType } from "./channel-type"

export type CommentAttachmentInfo = {
  hasImage: boolean
  hasVideo: boolean
  hasGif: boolean
}

const NO_ATTACHMENT: CommentAttachmentInfo = {
  hasImage: false,
  hasVideo: false,
  hasGif: false,
}

export function needsAttachmentInfo(
  hideComments: CommentHideComments,
): boolean {
  return (
    hideComments.hasImage ||
    hideComments.hasVideo ||
    Boolean(hideComments.hasGif)
  )
}

/**
 * Facebook reports a GIF comment as an `animated_image_*` attachment
 * (`animated_image_share` for a GIF picked from the composer,
 * `animated_image_video`/`animated_image_autoplay` for the video-backed
 * variants), never as `photo`.
 */
function isGifAttachmentType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.startsWith("animated_image")
}

const THREADS_IMAGE_MEDIA_TYPES = new Set(["IMAGE", "CAROUSEL_ALBUM"])

function threadsAttachmentInfo(
  attachment: ThreadsReplyAttachment | null | undefined,
): CommentAttachmentInfo {
  if (!attachment) {
    return NO_ATTACHMENT
  }
  return {
    hasImage: THREADS_IMAGE_MEDIA_TYPES.has(attachment.mediaType ?? ""),
    hasVideo: attachment.mediaType === "VIDEO",
    hasGif: Boolean(attachment.gifUrl),
  }
}

/**
 * Returns a memoized resolver that fetches a comment's attachment type at
 * most once per incoming comment, regardless of how many active automations
 * need it. Facebook answers all three flags from the comment's
 * `attachment.type`; Threads answers them from the reply's `gif_url` and
 * `media_type` (a GIF reply is still `TEXT_POST`, a photo reply is `IMAGE`,
 * or `CAROUSEL_ALBUM` for several); Instagram and TikTok have no attachment
 * data at all and
 * short-circuit to "no attachment" — unrelated to which channels support
 * private replies.
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
    if (channelType === "threads") {
      const attachment = await allIntegrations.threads
        ?.runAction("getReplyAttachment", {
          ctx: await buildContext({
            workspaceId,
            integrationType: "threads",
            integration: {
              ...integrationRow,
              auth: integrationRow.auth as ThreadsAuthValue,
            },
          }),
          input: { replyId: commentId },
        })
        .catch(() => null)
      cached = threadsAttachmentInfo(attachment)
      return cached
    }
    if (channelType !== "messenger") {
      cached = NO_ATTACHMENT
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
      hasGif: isGifAttachmentType(type),
    }
    return cached
  }
}
