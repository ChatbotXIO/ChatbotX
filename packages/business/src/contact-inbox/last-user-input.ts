import type { LastUserInputType } from "@chatbotx.io/database/partials"
import {
  contentTypes,
  lastUserInputTypes,
} from "@chatbotx.io/database/partials"
import { getPublicFileUrl } from "../utils"

type LastUserInputAttachment = {
  fileType: string
  originPath: string
}

type LastUserInputSource = {
  contentType: string
  text?: string | null
  attachments?: readonly LastUserInputAttachment[] | null
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
  const parsedType = lastUserInputTypes.safeParse(
    attachment?.fileType ?? source.contentType,
  )

  return {
    lastUserInput: resolveLastUserInput(source, attachment),
    lastUserInputType: parsedType.success ? parsedType.data : null,
  }
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
