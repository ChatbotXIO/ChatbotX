"use client"

import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { ConfirmDialog } from "../confirm-dialog"

/** Whether the adjust form can be confirmed: a non-zero whole delta and a reason. */
export function canSubmitAdjustment(delta: string, reason: string) {
  const value = Number(delta)
  return (
    delta.trim() !== "" &&
    Number.isInteger(value) &&
    value !== 0 &&
    reason.trim().length > 0
  )
}

/** "Adjust points": ± number and a REQUIRED reason (confirm disabled while empty). */
export function AdjustScoreDialog({
  open,
  onOpenChange,
  participantName,
  isPending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  participantName: string
  isPending: boolean
  onConfirm: (input: { delta: number; reason: string }) => void
}) {
  const t = useTranslations()
  const [delta, setDelta] = useState("")
  const [reason, setReason] = useState("")

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setDelta("")
      setReason("")
    }
  }

  return (
    <ConfirmDialog
      confirmDisabled={!canSubmitAdjustment(delta, reason)}
      confirmLabel={t("actions.confirm")}
      description={t("leaderboards.participants.adjust.description", {
        name: participantName,
      })}
      isPending={isPending}
      onConfirm={() =>
        onConfirm({ delta: Number(delta), reason: reason.trim() })
      }
      onOpenChange={handleOpenChange}
      open={open}
      title={t("leaderboards.participants.adjust.title")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="leaderboard-adjust-delta">
            {t("leaderboards.participants.adjust.delta")}
          </Label>
          <Input
            id="leaderboard-adjust-delta"
            inputMode="numeric"
            onChange={(event) => setDelta(event.target.value)}
            placeholder={t("leaderboards.participants.adjust.deltaPlaceholder")}
            type="number"
            value={delta}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="leaderboard-adjust-reason">
            {t("leaderboards.participants.adjust.reason")}
          </Label>
          <Textarea
            id="leaderboard-adjust-reason"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t(
              "leaderboards.participants.adjust.reasonPlaceholder",
            )}
            value={reason}
          />
        </div>
      </div>
    </ConfirmDialog>
  )
}
