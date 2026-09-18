"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { AlertCircleIcon } from "lucide-react"

type MessageErrorBadgeProps = {
  /** e.g. `t("sendFailed")` or `t("callFailed")` — the short, translated cause label. */
  label: string
  /** The raw detail appended after the label (a `sendError` string, or a
   * WhatsApp call's `failureReason`). Never truncated or reformatted here —
   * callers own how much detail is worth showing. */
  detail: string
}

/**
 * Shared error affordance for an outgoing message's `sendError` and a
 * WhatsApp call's `failureReason`, so both render the same icon/tooltip
 * instead of drifting apart.
 */
export const MessageErrorBadge = ({
  label,
  detail,
}: MessageErrorBadgeProps) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <span className="flex items-center self-center px-1 text-destructive">
          <AlertCircleIcon aria-hidden className="size-4" />
        </span>
      }
    />
    <TooltipContent>
      <p>
        {label}: {detail}
      </p>
    </TooltipContent>
  </Tooltip>
)
