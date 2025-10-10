import { StepType } from "@aha.chat/flow-config"
import type { FacebookMessageAttachment } from "../schemas"

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

export function convertMediaType(
  stepType: string,
): "audio" | "video" | "file" | "image" {
  switch (stepType) {
    case StepType.SEND_IMAGE:
      return "image"
    case StepType.SEND_AUDIO:
      return "audio"
    case StepType.SEND_VIDEO:
      return "video"
    default:
      return "file"
  }
}
