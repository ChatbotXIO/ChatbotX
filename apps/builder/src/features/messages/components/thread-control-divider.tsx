"use client"

import { useTranslations } from "next-intl"
import { useTenantSettings } from "@/features/tenant/tenant-settings-provider"
import {
  formatThreadControlActivity,
  type ThreadControlActivity,
} from "../lib/thread-control-content"

/** Centered, muted activity line for a routing state change. */
export function ThreadControlDivider({
  activity,
}: {
  activity: ThreadControlActivity
}) {
  const t = useTranslations()
  const { name: brand } = useTenantSettings()

  return (
    <span className="text-muted-foreground text-xs">
      {formatThreadControlActivity(activity, t, brand)}
    </span>
  )
}
