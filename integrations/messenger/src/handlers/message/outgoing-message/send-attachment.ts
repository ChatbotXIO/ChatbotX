import { stepTypes } from "@chatbotx.io/flow-config"
import type { FileType } from "@chatbotx.io/sdk"
import type { FacebookMessageAttachment } from "../../../schema"

export function getAttachmentTemplate(
  url: string,
  type: "image" | "video" | "audio" | "file",
): FacebookMessageAttachment {
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
