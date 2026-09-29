import { assertPublicUrl, buildContext } from "@chatbotx.io/business"
import { getStoragePrefix, uploadFileFromUrl } from "@chatbotx.io/filesystem"
import type { ThreadsAuthValue } from "@chatbotx.io/integration-threads"
import type { AuthValue, IncomingAttachment } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../lib/logger"
import { allIntegrations } from "../../services/integrations"

const COMMENT_MEDIA_MAX_BYTES = 25 * 1024 * 1024

/**
 * Re-hosts a comment's image/GIF on the tenant's storage. The URL comes from a
 * third-party CDN (Giphy, TikTok…), so it is fetched without any channel token
 * and behind the SSRF guard. Never throws: a comment without its media still
 * beats a comment that is not saved at all.
 */
export async function downloadCommentMediaAttachment(props: {
  url: string
  workspaceId: string
  commentId: string
}): Promise<IncomingAttachment | undefined> {
  const { url, workspaceId, commentId } = props
  try {
    const uploaded = await uploadFileFromUrl(
      url,
      `${getStoragePrefix(workspaceId)}/${createId()}`,
      "public-read",
      COMMENT_MEDIA_MAX_BYTES,
      (candidateUrl) => assertPublicUrl(candidateUrl, "Comment media URL"),
    )
    if (uploaded.fileType !== "image" && uploaded.fileType !== "video") {
      logger.warn(
        { commentId, mimeType: uploaded.mimeType },
        "downloadCommentMediaAttachment: comment media is not an image or video",
      )
      return
    }
    return {
      sourceId: createId(),
      fileType: uploaded.fileType,
      mimeType: uploaded.mimeType,
      originPath: uploaded.originPath,
      size: uploaded.size,
      width: uploaded.width,
      height: uploaded.height,
      name: uploaded.name,
    }
  } catch (err) {
    logger.warn(
      { err, commentId },
      "downloadCommentMediaAttachment: failed to download comment media",
    )
    return
  }
}

/**
 * A GIF reply on Threads is still a `TEXT_POST` and the reply webhook does not
 * carry the GIF, so `gif_url` has to be looked up per reply.
 */
export async function fetchThreadsCommentAttachments(props: {
  workspaceId: string
  commentId: string
  integrationRow: { id: string; auth: AuthValue; [x: string]: unknown }
}): Promise<IncomingAttachment[]> {
  const { workspaceId, commentId, integrationRow } = props
  const ctx = await buildContext({
    workspaceId,
    integrationType: "threads",
    integration: {
      ...integrationRow,
      auth: integrationRow.auth as ThreadsAuthValue,
    },
  })
  const gifUrl = await allIntegrations.threads
    ?.runAction("getReplyGifUrl", { ctx, input: { replyId: commentId } })
    .catch((err: unknown) => {
      logger.warn(
        { err, commentId },
        "fetchThreadsCommentAttachments: failed to read reply gif_url",
      )
      return null
    })
  if (!gifUrl) {
    return []
  }
  const attachment = await downloadCommentMediaAttachment({
    url: gifUrl,
    workspaceId,
    commentId,
  })
  return attachment ? [attachment] : []
}
