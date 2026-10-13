"use client"

import type { LeaderboardPlatform } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import {
  LEADERBOARD_PLATFORM_ICON,
  LEADERBOARD_PLATFORM_LABEL_KEY,
} from "../lib/platforms"

export function LeaderboardPlatformLabel({
  platform,
}: {
  platform: LeaderboardPlatform
}) {
  const t = useTranslations()
  const Icon = LEADERBOARD_PLATFORM_ICON[platform]
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span>{t(LEADERBOARD_PLATFORM_LABEL_KEY[platform])}</span>
    </span>
  )
}
