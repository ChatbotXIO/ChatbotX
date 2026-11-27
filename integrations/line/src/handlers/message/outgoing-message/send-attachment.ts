import type {
  SendAudioStepSchema,
  SendFileStepSchema,
  SendGifStepSchema,
  SendImageStepSchema,
  SendMultipleImagesStepSchema,
  SendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { OutgoingAttachment } from "@chatbotx.io/sdk"
import { flowButtons } from "./actions"
import type { LineMessage } from "./dispatch"
import { buttonsFollowUp } from "./flex"
import { textMessages } from "./send-text"

/** LINE requires an audio `duration`; flow steps and attachments never carry one. */
export const AUDIO_DURATION_FALLBACK_MS = 60_000

/**
 * The URL stands in for both fields here; `prepareLineMedia` (run by
 * `dispatchLineMessages`) swaps in an original and a preview that meet LINE's
 * limits (10 MB / 1 MB, JPEG or PNG).
 */
export const imageMessage = (url: string): LineMessage => ({
  type: "image",
  originalContentUrl: url,
  previewImageUrl: url,
})

/** `previewImageUrl` is replaced with a real image by `prepareLineMedia`. */
export const videoMessage = (url: string): LineMessage => ({
  type: "video",
  originalContentUrl: url,
  previewImageUrl: url,
})

export const audioMessage = (url: string): LineMessage => ({
  type: "audio",
  originalContentUrl: url,
  duration: AUDIO_DURATION_FALLBACK_MS,
})

/** Bots have no file message type, so a file goes out as its URL (D11). */
export const fileMessages = (url: string): LineMessage[] => textMessages(url)

type MediaStep =
  | SendImageStepSchema
  | SendVideoStepSchema
  | SendAudioStepSchema
  | SendFileStepSchema

/** One media URL as LINE messages; any kind LINE has no message type for goes out as a link. */
const urlMessages = (kind: string, url: string): LineMessage[] => {
  switch (kind) {
    case "image":
      return [imageMessage(url)]
    case "video":
      return [videoMessage(url)]
    case "audio":
      return [audioMessage(url)]
    default:
      return fileMessages(url)
  }
}

const STEP_MEDIA_KIND: Record<MediaStep["stepType"], string> = {
  sendImage: "image",
  sendVideo: "video",
  sendAudio: "audio",
  sendFile: "file",
}

const mediaMessages = (step: MediaStep): LineMessage[] =>
  urlMessages(STEP_MEDIA_KIND[step.stepType], step.url)

/** Media cannot carry buttons, so they follow in a flex bubble (see `buttonsFollowUp`). */
export const convertFlowStepMedia = (
  step: MediaStep,
  flowId: string,
): LineMessage[] => [
  ...mediaMessages(step),
  ...buttonsFollowUp(flowButtons(flowId, step.buttons)),
]

/**
 * LINE images must be JPEG/PNG, so a gif goes out as its URL, like a file.
 * Deliberately reverses spec D11's "gif → image".
 */
export const convertFlowStepGif = (step: SendGifStepSchema): LineMessage[] =>
  fileMessages(step.url)

export const convertFlowStepMultipleImages = (
  step: SendMultipleImagesStepSchema,
): LineMessage[] => step.images.map((image) => imageMessage(image.url))

/** An inbox / agent attachment as LINE messages. */
export const attachmentMessages = (
  attachment: OutgoingAttachment,
): LineMessage[] => urlMessages(attachment.fileType, attachment.url)
