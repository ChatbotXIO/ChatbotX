"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import { useLocale, useTranslations } from "next-intl"
import type { getMinigamePlaysAction } from "../actions/get-minigame-plays.action"

type Plays = NonNullable<
  Awaited<ReturnType<typeof getMinigamePlaysAction>>["data"]
>

export function MinigamePlayRecordDialog({
  contactName,
  plays,
  open,
  onOpenChange,
}: {
  contactName: string
  plays: Plays
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const locale = useLocale()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-col items-center gap-2 text-center">
            <span>{t("minigames.history.recordDialog.title")}</span>
            <span className="text-muted-foreground text-sm">{contactName}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] divide-y overflow-y-auto">
          {plays.map((play) => (
            <div
              className="flex items-center justify-between gap-2 py-3"
              key={play.id}
            >
              <div className="flex items-center gap-2">
                {play.isWinning ? (
                  <Badge>{t("minigames.history.recordDialog.win")}</Badge>
                ) : (
                  <Badge variant="secondary">
                    {t("minigames.history.recordDialog.lose")}
                  </Badge>
                )}
                {play.prizeName ? (
                  <span className="font-medium text-sm">{play.prizeName}</span>
                ) : null}
              </div>
              <span className="text-muted-foreground text-sm">
                {formatDate(play.createdAt, {
                  locale,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          ))}
          {plays.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              {t("minigames.history.recordDialog.empty")}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
