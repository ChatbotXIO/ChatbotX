"use client"

import {
  isMediaButtonsDropped,
  isMediaStepUnsupported,
} from "@chatbotx.io/flow-config"
import { TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"

type MediaStepNoticeProps = {
  /** Form path of the step, e.g. `steps.0`. */
  parentName: string
}

/**
 * Tells the author what the channel this node sends on will do with the media
 * step in front of them: send nothing at all, or send the media without the
 * buttons they just attached.
 *
 * Reads the same support table as the publish-time rules
 * (`media-step-rules.ts`), so the warning and the block can never disagree. A
 * node left on `omnichannel` — the default — gets neither, because it may only
 * ever serve channels that deliver the step in full.
 *
 * Watches rather than reads the form so the notice follows the step as the
 * channel and buttons are edited.
 */
export const MediaStepNotice = ({ parentName }: MediaStepNoticeProps) => {
  const t = useTranslations()
  const channel = useWatch({ name: "beforeStep.channel" })
  const stepType = useWatch({ name: `${parentName}.stepType` })
  const buttons = useWatch({ name: `${parentName}.buttons` })

  const messageKey = resolveMessageKey({ channel, stepType, buttons })
  if (!messageKey) {
    return null
  }

  return (
    <p
      className="mt-1 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-amber-900 text-xs dark:bg-amber-950/40 dark:text-amber-200"
      data-slot="media-step-notice"
      role="status"
    >
      <TriangleAlertIcon
        aria-hidden="true"
        className="mt-px size-3.5 shrink-0"
      />
      <span>{t(messageKey)}</span>
    </p>
  )
}

const resolveMessageKey = (props: {
  channel: string | undefined
  stepType: string | undefined
  buttons: unknown
}) => {
  const step = { channel: props.channel, stepType: props.stepType ?? "" }

  if (isMediaStepUnsupported(step)) {
    return "flows.media.stepUnsupportedOnChannel"
  }

  if (
    isMediaButtonsDropped({
      ...step,
      buttons: Array.isArray(props.buttons) ? props.buttons : [],
    })
  ) {
    return "flows.media.buttonsSkippedOnChannel"
  }

  return null
}
