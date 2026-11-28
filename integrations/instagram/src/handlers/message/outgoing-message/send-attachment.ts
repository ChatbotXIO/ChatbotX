import { stepTypes } from "@chatbotx.io/flow-config"
import type { FileType } from "@chatbotx.io/sdk"
import type { InstagramMessageAttachment } from "../../../schema"

export function getAttachmentTemplate(
  url: string,
  type: "image" | "video" | "audio" | "file",
): InstagramMessageAttachment {
  return {
    type,
    payload: {
      url,
      is_reusable: true,
    },
  }
}

export function convertMediaType(stepType: string): FileType {
  switch (stepType) {
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendGif:
      return "image"
    case stepTypes.enum.sendAudio:
      return "audio"
    case stepTypes.enum.sendVideo:
      return "video"
    default:
      return "file"
  }
}

/**
 * Shares one of the business's own posts: the post's platform id in a
 * `MEDIA_SHARE` attachment. Both Instagram logins document the same payload.
 */
export function toMediaShareAttachment(
  externalPostId: string,
): InstagramMessageAttachment {
  return {
    type: "MEDIA_SHARE",
    payload: { id: externalPostId },
  }
}
