import { db } from "@chatbotx.io/database/client"
import type { AttachmentModel } from "@chatbotx.io/database/types"
import { IMAGE_MIME_TYPES } from "@chatbotx.io/sdk"
import type { ResolveConversationSourceInput } from "./types"

const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>(IMAGE_MIME_TYPES)

function normalizeMimeType(value: string): string {
  return value.toLowerCase().split(";")[0]?.trim() ?? ""
}

export function isSupportedImageMimeType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_MIME_TYPES.has(normalizeMimeType(mimeType))
}

function normalizeHint(value?: string): null | string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  return normalized
}

function matchesHint(attachment: AttachmentModel, hint: string): boolean {
  const haystack = [
    attachment.name ?? "",
    attachment.originPath ?? "",
    attachment.sourceId ?? "",
  ]
    .join(" ")
    .toLowerCase()

  return haystack.includes(hint)
}

export async function resolveImageAttachment(
  input: ResolveConversationSourceInput,
): Promise<AttachmentModel | null> {
  const allAttachments = await db.query.attachmentModel.findMany({
    where: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  const attachments = allAttachments.filter((attachment) =>
    isSupportedImageMimeType(attachment.mimeType),
  )

  if (attachments.length === 0) {
    return null
  }

  const hint = normalizeHint(input.sourceHint)
  const triggerMessageAttachment = input.messageId
    ? attachments.find((attachment) => attachment.messageId === input.messageId)
    : null

  return (
    (hint
      ? attachments.find((attachment) => matchesHint(attachment, hint))
      : null) ??
    triggerMessageAttachment ??
    attachments[0] ??
    null
  )
}
