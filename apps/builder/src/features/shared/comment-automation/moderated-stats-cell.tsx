"use client"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { ModerationLogCard } from "./moderation-log-card"

/**
 * The Moderated column: how many comments the automation hid or deleted.
 * Clicking it opens the same moderation log the analytics page shows.
 */
export function ModeratedStatsCell({
  workspaceId,
  automationId,
  value,
}: {
  workspaceId: string
  automationId: string
  value: number
}) {
  const t = useTranslations()
  const formatter = useFormatter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className={
          value ? "cursor-pointer tabular-nums hover:underline" : "tabular-nums"
        }
        disabled={!value}
        onClick={() => setOpen(true)}
        type="button"
      >
        {value ? formatter.number(value) : "----"}
      </button>
      {open && (
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
            <DialogTitle className="sr-only">
              {t("commentAutomation.moderationLog.title")}
            </DialogTitle>
            <ModerationLogCard
              automationId={automationId}
              workspaceId={workspaceId}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
