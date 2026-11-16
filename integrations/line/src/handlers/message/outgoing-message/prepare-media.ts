import {
  OutboundMediaError,
  resolveOutboundImageRenditions,
  resolveVideoPreviewPlaceholderUrl,
} from "@chatbotx.io/business/outbound-media"
import {
  ChannelError,
  ChannelErrorCategory,
  type Context,
} from "@chatbotx.io/sdk"
import type { LineAuthValue } from "../../../schema"
import type { LineMessage } from "./dispatch"
import { LINE_LIMITS } from "./limits"

const isMediaMessage = (message: LineMessage): boolean =>
  (message.type === "image" || message.type === "video") &&
  typeof message.originalContentUrl === "string"

const toChannelError = (error: unknown): unknown => {
  if (!(error instanceof OutboundMediaError)) {
    return error
  }
  return new ChannelError(
    `LINE media could not be prepared: ${error.message}`,
    error.retryable
      ? ChannelErrorCategory.NETWORK_ERROR
      : ChannelErrorCategory.PAYLOAD_INVALID,
    { httpStatusCode: error.retryable ? 503 : 400 },
  )
}

/**
 * Rewrites `image` and `video` messages so LINE accepts them; every other
 * message is returned untouched.
 *
 * - `image`: LINE fetches `originalContentUrl` (HTTPS JPEG/PNG, <= 10 MB) and
 *   `previewImageUrl` (HTTPS JPEG/PNG, <= 1 MB) itself. An image that does not
 *   fit is re-encoded into workspace storage; one that fits is reused.
 * - `video`: `previewImageUrl` must be an image, never the video, so it is
 *   a static placeholder hosted in the workspace's storage.
 *
 * Throws a typed `ChannelError` when an image cannot be made to fit, so the
 * send fails with a clear reason instead of LINE dropping it silently.
 */
export const prepareLineMedia = async (
  ctx: Context<LineAuthValue>,
  messages: LineMessage[],
): Promise<LineMessage[]> => {
  if (!messages.some(isMediaMessage)) {
    return messages
  }
  const storage = {
    storagePrefix: ctx.storagePrefix,
    storageUrl: ctx.platform.storageUrl,
    uploader: ctx.uploader,
  }
  try {
    return await Promise.all(
      messages.map(async (message): Promise<LineMessage> => {
        if (!isMediaMessage(message)) {
          return message
        }
        const url = message.originalContentUrl as string
        if (message.type === "video") {
          return {
            ...message,
            previewImageUrl: await resolveVideoPreviewPlaceholderUrl(storage),
          }
        }
        const { originalUrl, previewUrl } =
          await resolveOutboundImageRenditions({
            url,
            originalMaxBytes: LINE_LIMITS.imageOriginalMaxBytes,
            previewMaxBytes: LINE_LIMITS.imagePreviewMaxBytes,
            ...storage,
          })
        return {
          ...message,
          originalContentUrl: originalUrl,
          previewImageUrl: previewUrl,
        }
      }),
    )
  } catch (error) {
    throw toChannelError(error)
  }
}
