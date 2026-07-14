import type { useTranslations } from "next-intl"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"

const EMPTY_PREVIEW = " "

export function resolveLastMessagePreview(
  message: MessageResourceWithRelations | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  if (message?.text) {
    return message.text
  }

  const attachmentCount =
    message?.attachmentCount ?? message?.attachments?.length ?? 0
  if (attachmentCount > 0) {
    return t("messages.sentAttachments", { count: attachmentCount })
  }

  return EMPTY_PREVIEW
}
