"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useQueryClient } from "@tanstack/react-query"
import {
  BanIcon,
  DiffIcon,
  HistoryIcon,
  MoreVerticalIcon,
  RotateCcwIcon,
  UndoIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  adjustParticipantScoreAction,
  resetParticipantScoreAction,
  setParticipantBannedAction,
} from "../../actions/participant.action"
import { useInvalidateLeaderboards } from "../../lib/use-invalidate-leaderboards"
import { AdjustScoreDialog } from "./adjust-score-dialog"
import { ParticipantHistoryDialog } from "./participant-history-dialog"

type Dialog = "adjust" | "ban" | "reset" | "history" | null

/**
 * Per-participant actions. Manual edits (adjust/ban/reset) exist only while
 * the leaderboard is active or paused — the service rejects them otherwise.
 */
export function ParticipantRowMenu({
  workspaceId,
  leaderboardId,
  contactId,
  participantName,
  isBanned,
  editable,
}: {
  workspaceId: string
  leaderboardId: string
  contactId: string
  participantName: string
  isBanned: boolean
  editable: boolean
}) {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const invalidateLeaderboards = useInvalidateLeaderboards()
  const [dialog, setDialog] = useState<Dialog>(null)

  const afterMutation = (message: string) => {
    toast.success(message)
    setDialog(null)
    invalidateLeaderboards()
    queryClient.invalidateQueries({ queryKey: ["leaderboard-audit-log"] })
    queryClient.invalidateQueries({ queryKey: ["leaderboard-history"] })
    router.refresh()
  }
  const onError = ({ error }: { error: { serverError?: string } }) => {
    toast.error(error.serverError ?? t("messages.error"))
  }

  const adjust = useAction(
    adjustParticipantScoreAction.bind(null, workspaceId),
    {
      onSuccess: () =>
        afterMutation(t("leaderboards.participants.adjust.success")),
      onError,
    },
  )
  const ban = useAction(setParticipantBannedAction.bind(null, workspaceId), {
    onSuccess: ({ input }) =>
      afterMutation(
        input.isBanned
          ? t("leaderboards.participants.banned")
          : t("leaderboards.participants.unbanned"),
      ),
    onError,
  })
  const reset = useAction(resetParticipantScoreAction.bind(null, workspaceId), {
    onSuccess: () => afterMutation(t("leaderboards.participants.resetDone")),
    onError,
  })
  const target = { id: leaderboardId, contactId }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon" variant="ghost">
              <MoreVerticalIcon className="size-4" />
              <span className="sr-only">{t("actions.openMenu")}</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {editable && !isBanned ? (
            <DropdownMenuItem onClick={() => setDialog("adjust")}>
              <DiffIcon />
              {t("leaderboards.participants.actions.adjust")}
            </DropdownMenuItem>
          ) : null}
          {editable ? (
            <DropdownMenuItem onClick={() => setDialog("ban")}>
              {isBanned ? <UndoIcon /> : <BanIcon />}
              {isBanned
                ? t("leaderboards.participants.actions.unban")
                : t("leaderboards.participants.actions.ban")}
            </DropdownMenuItem>
          ) : null}
          {editable && !isBanned ? (
            <DropdownMenuItem
              onClick={() => setDialog("reset")}
              variant="destructive"
            >
              <RotateCcwIcon />
              {t("leaderboards.participants.actions.reset")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => setDialog("history")}>
            <HistoryIcon />
            {t("leaderboards.participants.actions.history")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AdjustScoreDialog
        isPending={adjust.isPending}
        onConfirm={({ delta, reason }) =>
          adjust.execute({ ...target, delta, reason })
        }
        onOpenChange={(open) => !open && setDialog(null)}
        open={dialog === "adjust"}
        participantName={participantName}
      />
      <ConfirmDialog
        confirmLabel={
          isBanned
            ? t("leaderboards.participants.actions.unban")
            : t("leaderboards.participants.actions.ban")
        }
        description={
          isBanned
            ? t("leaderboards.participants.unbanConfirm", {
                name: participantName,
              })
            : t("leaderboards.participants.banConfirm", {
                name: participantName,
              })
        }
        destructive={!isBanned}
        isPending={ban.isPending}
        onConfirm={() =>
          ban.execute({ ...target, isBanned: !isBanned, reason: "" })
        }
        onOpenChange={(open) => !open && setDialog(null)}
        open={dialog === "ban"}
        title={
          isBanned
            ? t("leaderboards.participants.actions.unban")
            : t("leaderboards.participants.actions.ban")
        }
      />
      <ConfirmDialog
        confirmLabel={t("leaderboards.participants.actions.reset")}
        description={t("leaderboards.participants.resetConfirm", {
          name: participantName,
        })}
        destructive
        isPending={reset.isPending}
        onConfirm={() => reset.execute({ ...target, reason: "" })}
        onOpenChange={(open) => !open && setDialog(null)}
        open={dialog === "reset"}
        title={t("leaderboards.participants.actions.reset")}
      />
      {dialog === "history" ? (
        <ParticipantHistoryDialog
          contactId={contactId}
          leaderboardId={leaderboardId}
          onOpenChange={(open) => !open && setDialog(null)}
          participantName={participantName}
          workspaceId={workspaceId}
        />
      ) : null}
    </>
  )
}
