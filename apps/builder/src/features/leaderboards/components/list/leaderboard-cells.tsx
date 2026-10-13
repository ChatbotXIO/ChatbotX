"use client"

import { formatDate } from "@chatbotx.io/ui/lib/format"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { daysLeft } from "../../lib/format"
import { supportsPostScope } from "../../lib/platforms"
import type { LeaderboardRow } from "../../queries"
import { LeaderboardPlatformLabel } from "../leaderboard-platform-label"

const DATE_TIME_FORMAT = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const

/** Name, start–end window and the days-left countdown. */
export function LeaderboardCampaignCell({
  leaderboard,
  href,
}: {
  leaderboard: Pick<LeaderboardRow, "name" | "startsAt" | "endsAt" | "status">
  href: string
}) {
  const t = useTranslations()
  const locale = useLocale()
  const remainingDays = daysLeft(leaderboard.endsAt)
  const isRunning =
    leaderboard.status === "active" || leaderboard.status === "paused"
  return (
    <div className="flex min-w-48 flex-col gap-0.5">
      <Link
        className="max-w-64 truncate font-medium hover:underline"
        href={href}
      >
        {leaderboard.name}
      </Link>
      <span className="text-muted-foreground text-xs">
        {formatDate(leaderboard.startsAt, { locale, ...DATE_TIME_FORMAT })}
        {" – "}
        {formatDate(leaderboard.endsAt, { locale, ...DATE_TIME_FORMAT })}
      </span>
      {isRunning ? (
        <span className="font-medium text-primary text-xs">
          {remainingDays > 0
            ? t("leaderboards.list.daysLeft", { days: remainingDays })
            : t("leaderboards.list.ended")}
        </span>
      ) : null}
    </div>
  )
}

/** Platform, host channel / minigame and the post or group scope. */
export function LeaderboardChannelCell({
  leaderboard,
  hostName,
}: {
  leaderboard: Pick<LeaderboardRow, "platform" | "scope">
  hostName: string | null
}) {
  const t = useTranslations()
  const { platform, scope } = leaderboard
  let scopeText: string | null = null
  if (supportsPostScope(platform)) {
    scopeText =
      scope.postScope === "specific"
        ? t("leaderboards.scope.specificPostsCount", {
            count: scope.postIds.length,
          })
        : t("leaderboards.scope.allPosts")
  } else if (platform === "telegram" && scope.telegramChatIds.length > 0) {
    scopeText = t("leaderboards.scope.telegramChatsCount", {
      count: scope.telegramChatIds.length,
    })
  }
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <LeaderboardPlatformLabel platform={platform} />
      {hostName ? (
        <span className="max-w-48 truncate text-muted-foreground text-xs">
          {hostName}
        </span>
      ) : null}
      {scopeText ? (
        <span className="text-muted-foreground text-xs">{scopeText}</span>
      ) : null}
    </div>
  )
}

export function LeaderboardParticipantsCell({
  stats,
}: {
  stats: LeaderboardRow["stats"]
}) {
  const t = useTranslations()
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{stats.participants.toLocaleString()}</span>
      {stats.newToday > 0 ? (
        <span className="text-emerald-600 text-xs dark:text-emerald-400">
          {t("leaderboards.list.newToday", { count: stats.newToday })}
        </span>
      ) : null}
    </div>
  )
}

export function LeaderboardPointsCell({
  stats,
}: {
  stats: LeaderboardRow["stats"]
}) {
  const t = useTranslations()
  const average =
    stats.participants > 0
      ? Math.round(stats.totalPoints / stats.participants)
      : 0
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{stats.totalPoints.toLocaleString()}</span>
      <span className="text-muted-foreground text-xs">
        {t("leaderboards.list.average", { value: average.toLocaleString() })}
      </span>
    </div>
  )
}
