import type { LastUserInputType } from "@chatbotx.io/database/partials"
import {
  contentTypes,
  lastUserInputTypes,
} from "@chatbotx.io/database/partials"
import { isStoryMention } from "@chatbotx.io/sdk"
import { getPublicFileUrl } from "../utils"

type LastUserInputAttachment = {
  fileType: string
  originPath: string
}

type LastUserInputSource = {
  contentType: string
  text?: string | null
  attachments?: readonly LastUserInputAttachment[] | null
  contentAttributes?: unknown
  storageUrl: string
}

export type LastUserInputTracking = {
  lastUserInput: string | null
  lastUserInputType: LastUserInputType | null
}

export function resolveLastUserInputTracking(
  source: LastUserInputSource,
): LastUserInputTracking {
  const attachment = source.attachments?.[0]

  return {
    lastUserInput: resolveLastUserInput(source, attachment),
    lastUserInputType: resolveLastUserInputType(source, attachment),
  }
}

function resolveLastUserInputType(
  source: LastUserInputSource,
  attachment?: LastUserInputAttachment,
): LastUserInputType | null {
  // A story mention carries the story's media as an ordinary image/video
  // attachment; only its content attributes tell it apart from a photo sent
  // in the chat.
  if (isStoryMention(source.contentAttributes)) {
    return lastUserInputTypes.enum.storyMention
  }
  const parsedType = lastUserInputTypes.safeParse(
    attachment?.fileType ?? source.contentType,
  )
  return parsedType.success ? parsedType.data : null
}

function resolveLastUserInput(
  source: LastUserInputSource,
  attachment?: LastUserInputAttachment,
): string | null {
  if (attachment) {
    return getPublicFileUrl(attachment.originPath, source.storageUrl)
  }

  if (source.contentType === contentTypes.enum.text) {
    return source.text ?? null
  }

  return null
}
