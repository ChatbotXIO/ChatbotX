"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { cn } from "@chatbotx.io/ui/lib/utils"
import type { PublishDestinationState } from "@chatbotx.io/utils/publish-destination"
import {
  CheckIcon,
  LockIcon,
  type LucideIcon,
  PlugZapIcon,
  UnplugIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

const STATE_ICONS: Record<PublishDestinationState, LucideIcon> = {
  inboxDisconnected: UnplugIcon,
  needsReconnect: PlugZapIcon,
  permissionMissing: LockIcon,
  ready: CheckIcon,
}

const STATE_TONES: Record<PublishDestinationState, string> = {
  inboxDisconnected: "bg-muted text-muted-foreground",
  needsReconnect: "bg-destructive/10 text-destructive",
  permissionMissing: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
}

/** The state of a publish destination: an icon and a label, coloured by severity. */
export const DestinationStateBadge = ({
  className,
  state,
}: {
  className?: string
  state: PublishDestinationState
}) => {
  const t = useTranslations()
  const Icon = STATE_ICONS[state]
  return (
    <Badge className={cn("border-0", STATE_TONES[state], className)}>
      <Icon aria-hidden="true" />
      {t(`composer.destinationState.${state}`)}
    </Badge>
  )
}
