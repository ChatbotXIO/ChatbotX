"use client"

import { isTiktokCardTitleTruncated } from "@chatbotx.io/flow-config"
import { TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"

type TiktokTitleNoticeProps = {
  /** Form path of the step, e.g. `steps.0`. */
  parentName: string
}

/**
 * Tells the author that TikTok will cut this message short.
 *
 * Confirmed against production: once buttons are attached, TikTok's
 * QA_BUTTON_CARD/QA_LINK_CARD send truncates (integrations/tiktok now clamps
 * to the same 40-char limit instead of failing) rather than sending the full
 * text, so this is the only place the loss is visible before the send.
 *
 * Watches rather than reads the form so the notice follows the step as the
 * text and buttons are edited.
 */
export const TiktokTitleNotice = ({ parentName }: TiktokTitleNoticeProps) => {
  const t = useTranslations()
  const channel = useWatch({ name: "beforeStep.channel" })
  const text = useWatch({ name: `${parentName}.text` })
  const buttons = useWatch({ name: `${parentName}.buttons` })

  if (!isTiktokCardTitleTruncated({ channel, buttons, text })) {
    return null
  }

  return (
    <p
      className="mt-1 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-amber-900 text-xs dark:bg-amber-950/40 dark:text-amber-200"
      data-slot="tiktok-title-notice"
      role="status"
    >
      <TriangleAlertIcon
        aria-hidden="true"
        className="mt-px size-3.5 shrink-0"
      />
      <span>{t("flows.sendText.tiktokTitleTruncated")}</span>
    </p>
  )
}
