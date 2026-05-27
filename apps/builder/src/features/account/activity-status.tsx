"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth/auth-client"

export type ActivityStatus = "available" | "busy" | "offline"

export const ACTIVITY_STATUSES: ActivityStatus[] = [
  "available",
  "busy",
  "offline",
]

const STATUS_COLOR: Record<ActivityStatus, string> = {
  available: "bg-emerald-500",
  busy: "bg-amber-500",
  offline: "bg-zinc-400",
}

const STATUS_RING: Record<ActivityStatus, string> = {
  available: "ring-emerald-500/30",
  busy: "ring-amber-500/30",
  offline: "ring-zinc-400/30",
}

export function isActivityStatus(value: unknown): value is ActivityStatus {
  return (
    typeof value === "string" && (ACTIVITY_STATUSES as string[]).includes(value)
  )
}

export function getActivityStatusColor(status: ActivityStatus): string {
  return STATUS_COLOR[status]
}

export function ActivityStatusDot({
  status,
  className,
  withRing = false,
}: {
  status: ActivityStatus
  className?: string
  withRing?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 rounded-full",
        STATUS_COLOR[status],
        withRing && `ring-2 ${STATUS_RING[status]}`,
        className,
      )}
    />
  )
}

type ActivityStatusSelectorProps = {
  current: ActivityStatus
  /** Custom trigger; defaults to pill button "● Available". */
  trigger?: ReactNode
  /** Where the dropdown opens relative to trigger. */
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}

export function ActivityStatusSelector({
  current,
  trigger,
  side = "bottom",
  align = "start",
}: ActivityStatusSelectorProps) {
  const t = useTranslations("personalSettings.activityStatus")
  const [pending, setPending] = useState(false)

  const handlePick = async (next: ActivityStatus) => {
    if (next === current || pending) {
      return
    }
    setPending(true)
    const { error } = await authClient.updateUser({
      activityStatus: next,
    } as unknown as Parameters<typeof authClient.updateUser>[0])
    setPending(false)
    if (error) {
      toast.error(error.message ?? t("updateError"))
      return
    }
    toast.success(t("updateSuccess", { status: t(next) }))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            className="inline-flex items-center gap-2 rounded-md border border-white/[0.08] bg-app-surface px-3 py-1.5 text-sm transition hover:bg-white/[0.04]"
            disabled={pending}
            type="button"
          >
            <ActivityStatusDot status={current} />
            {t(current)}
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-40" side={side}>
        {ACTIVITY_STATUSES.map((s) => (
          <DropdownMenuItem
            className="gap-2"
            disabled={pending}
            key={s}
            onClick={() => handlePick(s)}
          >
            <ActivityStatusDot status={s} />
            <span>{t(s)}</span>
            {s === current && (
              <span className="ml-auto text-text-secondary text-xs">•</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
