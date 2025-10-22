import { StepType } from "@aha.chat/flow-config"
import type { FileType } from "@aha.chat/sdk"
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

export function convertMediaType(stepType: string): FileType {
  switch (stepType) {
    case StepType.sendImage:
      return "image"
    case StepType.sendAudio:
      return "audio"
    case StepType.sendVideo:
      return "video"
    default:
      return "file"
  }
}
