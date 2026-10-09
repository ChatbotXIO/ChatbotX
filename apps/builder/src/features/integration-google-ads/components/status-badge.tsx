import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CheckCircle2Icon,
  ClockIcon,
  MinusCircleIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import type { StatusTone } from "../lib/status"

const toneClass = {
  success:
    "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  info: "border-sky-600/30 bg-sky-600/10 text-sky-700 dark:text-sky-400",
  warning:
    "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  muted: "bg-muted/50 text-muted-foreground",
} as const satisfies Record<StatusTone, string>

const toneIcon = {
  success: CheckCircle2Icon,
  info: ClockIcon,
  warning: TriangleAlertIcon,
  danger: XCircleIcon,
  muted: MinusCircleIcon,
} as const satisfies Record<StatusTone, typeof ClockIcon>

type StatusBadgeProps = {
  tone: StatusTone
  children: ReactNode
  className?: string
}

/** Outline badge whose colour, icon and label all carry the status. */
export const StatusBadge = ({
  tone,
  children,
  className,
}: StatusBadgeProps) => {
  const Icon = toneIcon[tone]
  return (
    <Badge className={cn(toneClass[tone], className)} variant="outline">
      <Icon aria-hidden="true" />
      {children}
    </Badge>
  )
}
