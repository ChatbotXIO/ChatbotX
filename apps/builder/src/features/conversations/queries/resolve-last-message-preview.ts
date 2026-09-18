import {
  getWhatsappCallEntity,
  resolveWhatsappCallActivityLabelKey,
  type WhatsappCallActivityLabelKey,
} from "@chatbotx.io/sdk"
import type { useTranslations } from "next-intl"
import { formatCallDurationSeconds } from "@/features/messages/lib/format-call-duration"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"

const EMPTY_PREVIEW = " "

/**
 * The icon-selection discriminator for a call message in the conversation
 * list — the four non-completed outcomes are the label key itself;
 * `completed` splits by direction, since it renders no label at all in the
 * preview (see {@link resolveLastMessagePreview}) but still needs its own
 * icon (`completedInbound`/`completedOutbound`).
 */
export type CallPreviewKind =
  | "completedInbound"
  | "completedOutbound"
  | WhatsappCallActivityLabelKey

/** Centralizes the one `getWhatsappCallEntity` guard so
 * {@link resolveLastMessagePreview} and {@link resolveCallPreviewKind} can
 * never check the shape differently. */
const resolveCallEntity = (message: MessageResourceWithRelations | undefined) =>
  getWhatsappCallEntity(message?.contentAttributes)

/**
 * Which icon `conversation-item.tsx` should show next to a call preview —
 * `undefined` for any non-call message, so callers can `??` past it into
 * their own icon lookup.
 */
export function resolveCallPreviewKind(
  message: MessageResourceWithRelations | undefined,
): CallPreviewKind | undefined {
  const callEntity = resolveCallEntity(message)
  if (!callEntity) {
    return
  }
  if (callEntity.status === "completed") {
    return callEntity.direction === "businessInitiated"
      ? "completedOutbound"
      : "completedInbound"
  }
  return resolveWhatsappCallActivityLabelKey(
    callEntity.status,
    callEntity.direction,
  )
}

export function resolveLastMessagePreview(
  message: MessageResourceWithRelations | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  // A call activity message stores its English fallback in `message.text`
  // (see `buildCallActivityText`) so it can never come out empty for a
  // legacy client — but the inbox list must localize it via next-intl, not
  // show that stored English string, so this check runs BEFORE the
  // `message.text` fallback below.
  const callEntity = resolveCallEntity(message)
  if (callEntity) {
    if (callEntity.status !== "completed") {
      return t(
        `messages.${resolveWhatsappCallActivityLabelKey(callEntity.status, callEntity.direction)}`,
      )
    }
    return callEntity.durationSeconds === undefined
      ? t("messages.voiceCall")
      : t("messages.voiceCallDuration", {
          duration: formatCallDurationSeconds(callEntity.durationSeconds),
        })
  }

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
