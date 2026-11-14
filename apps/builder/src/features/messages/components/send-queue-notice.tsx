"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { AlertTriangleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  SEND_QUEUE_HOLD_REASONS,
  type SendQueueHoldReason,
} from "../lib/send-queue"

type SendQueueNoticeProps = {
  heldCount: number
  reason: SendQueueHoldReason | null
  onContinue: () => void
  onDiscard: () => void
}

/**
 * Shown while messages typed after a failed (or unconfirmed) one are held back.
 * A failed message is resent from its own row; an unconfirmed one needs the
 * person to say whether to go on. Either way the held messages can be dropped.
 */
export function SendQueueNotice({
  heldCount,
  reason,
  onContinue,
  onDiscard,
}: SendQueueNoticeProps) {
  const t = useTranslations()
  const isUnconfirmed = reason === SEND_QUEUE_HOLD_REASONS.unconfirmed

  return (
    <div
      className="mx-2.5 mb-1 flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
      role="alert"
    >
      <p className="flex items-start gap-2 font-medium text-destructive">
        <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          {t(
            isUnconfirmed
              ? "messages.sendQueue.unconfirmed"
              : "messages.sendQueue.failed",
            { count: heldCount },
          )}
        </span>
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {isUnconfirmed && (
          <Button
            onClick={onContinue}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("messages.sendQueue.continue")}
          </Button>
        )}
        <Button onClick={onDiscard} size="sm" type="button" variant="ghost">
          {t("messages.sendQueue.discard")}
        </Button>
      </div>
    </div>
  )
}
