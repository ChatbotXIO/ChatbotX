"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { cn } from "@chatbotx.io/ui/lib/utils"
import type { PublishPauseReason } from "@chatbotx.io/utils/publish-limits"
import { PauseCircleIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"

const PauseBadge = ({
  className,
  pausedUntil,
  pauseReason,
}: {
  className?: string
  pausedUntil: Date
  pauseReason: PublishPauseReason
}) => {
  const t = useTranslations()
  const format = useFormatter()
  return (
    <Badge
      className={cn(
        "border-0 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        className,
      )}
      title={t(`composer.destinationPause.reason.${pauseReason}`)}
    >
      <PauseCircleIcon aria-hidden="true" />
      {t("composer.destinationPause.until", {
        time: format.dateTime(pausedUntil, {
          dateStyle: "short",
          timeStyle: "short",
        }),
      })}
    </Badge>
  )
}

/**
 * A small hint on a destination whose publishing the network limited: it says
 * until when and why. Posts due meanwhile wait; nothing fails. Renders nothing
 * when the destination is not paused or the pause is over.
 */
export const DestinationPauseHint = ({
  className,
  pausedUntil,
  pauseReason,
}: {
  className?: string
  pausedUntil: Date | null
  pauseReason: PublishPauseReason | null
}) => {
  if (!(pausedUntil && pauseReason) || pausedUntil.getTime() <= Date.now()) {
    return null
  }
  return (
    <PauseBadge
      className={className}
      pausedUntil={pausedUntil}
      pauseReason={pauseReason}
    />
  )
}
