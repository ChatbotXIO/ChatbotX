"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useLeaderboardOptions } from "../../lib/use-leaderboard-options"

/** Quick switch to another leaderboard's participants, with participant counts. */
export function LeaderboardSwitcher({
  workspaceId,
  leaderboardId,
  currentName,
}: {
  workspaceId: string
  leaderboardId: string
  currentName: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const { leaderboards } = useLeaderboardOptions()
  const items = leaderboards.some((item) => item.id === leaderboardId)
    ? leaderboards
    : [
        {
          id: leaderboardId,
          name: currentName,
          participants: 0,
          status: "draft" as const,
          platform: "messenger" as const,
        },
        ...leaderboards,
      ]

  return (
    <Select
      items={items.map((item) => ({ label: item.name, value: item.id }))}
      onValueChange={(value) => {
        if (value && value !== leaderboardId) {
          router.push(
            `/space/${workspaceId}/leaderboards/${value as string}/participants`,
          )
        }
      }}
      value={leaderboardId}
    >
      <SelectTrigger
        aria-label={t("leaderboards.participants.switcher")}
        className="w-64"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            <span className="truncate">{item.name}</span>
            <span className="ms-auto text-muted-foreground text-xs">
              {t("leaderboards.participants.count", {
                count: item.participants,
              })}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
