"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { getParticipantHistoryAction } from "../../actions/participant.action"
import { LEADERBOARD_RULE_LABEL_KEY } from "../../lib/platforms"

const SOURCE_LABEL_KEY = {
  rule: "leaderboards.participants.history.sources.rule",
  flow: "leaderboards.participants.history.sources.flow",
  referral: "leaderboards.participants.history.sources.referral",
  manual: "leaderboards.participants.history.sources.manual",
  reset: "leaderboards.participants.history.sources.reset",
} as const

const isKnownKey = <T extends Record<string, string>>(
  map: T,
  key: string | null,
): key is Extract<keyof T, string> => key !== null && key in map

/** One participant's score changes during the campaign (anti-cheat). */
export function ParticipantHistoryDialog({
  workspaceId,
  leaderboardId,
  contactId,
  participantName,
  onOpenChange,
}: {
  workspaceId: string
  leaderboardId: string
  contactId: string
  participantName: string
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const locale = useLocale()
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["leaderboard-history", workspaceId, leaderboardId, contactId],
    queryFn: async () => {
      const result = await getParticipantHistoryAction.bind(
        null,
        workspaceId,
      )({ id: leaderboardId, contactId })
      return result?.data ?? []
    },
  })

  const describe = (event: (typeof events)[number]) => {
    if (isKnownKey(LEADERBOARD_RULE_LABEL_KEY, event.rule)) {
      return t(LEADERBOARD_RULE_LABEL_KEY[event.rule])
    }
    return isKnownKey(SOURCE_LABEL_KEY, event.source)
      ? t(SOURCE_LABEL_KEY[event.source])
      : event.source
  }

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("leaderboards.participants.history.title", {
              name: participantName,
            })}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] divide-y overflow-y-auto">
          {isLoading ? (
            <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
          ) : null}
          {!isLoading && events.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              {t("leaderboards.participants.history.empty")}
            </p>
          ) : null}
          {events.map((event) => (
            <div
              className="flex items-center justify-between gap-3 py-2.5"
              key={event.id}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-sm">
                  {describe(event)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatDate(event.createdAt, {
                    locale,
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
              <span
                className={cn(
                  "font-semibold text-sm",
                  event.delta >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive",
                )}
              >
                {event.delta > 0 ? `+${event.delta}` : event.delta}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
