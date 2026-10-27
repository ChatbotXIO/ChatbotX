"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  CopyIcon,
  DownloadIcon,
  FlagIcon,
  GiftIcon,
  type LucideIcon,
  MoreVerticalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  SendIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { Fragment, useMemo, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useClipboard } from "@/hooks/use-clipboard"
import { changeLeaderboardStatusAction } from "../../actions/change-leaderboard-status.action"
import { deleteLeaderboardAction } from "../../actions/delete-leaderboard.action"
import { resetLeaderboardPointsAction } from "../../actions/reset-leaderboard-points.action"
import type { LeaderboardStatusChange } from "../../lib/action-schemas"
import {
  buildLeaderboardMenu,
  DANGER_MENU_ITEMS,
  type LeaderboardMenuItem,
} from "../../lib/menu"
import { useInvalidateLeaderboards } from "../../lib/use-invalidate-leaderboards"
import type { LeaderboardRow } from "../../queries"
import { ExportLeaderboardDialog } from "./export-leaderboard-dialog"
import { TriggerRewardsDialog } from "./trigger-rewards-dialog"

const MENU_ITEM_CONFIG = {
  edit: { icon: PencilIcon, labelKey: "actions.edit" },
  publish: { icon: SendIcon, labelKey: "actions.publish" },
  start: { icon: PlayIcon, labelKey: "leaderboards.menu.start" },
  pause: { icon: PauseIcon, labelKey: "leaderboards.menu.pause" },
  viewParticipants: {
    icon: UsersIcon,
    labelKey: "leaderboards.menu.viewParticipants",
  },
  copyLink: { icon: CopyIcon, labelKey: "leaderboards.menu.copyLink" },
  export: { icon: DownloadIcon, labelKey: "actions.export" },
  triggerRewards: {
    icon: GiftIcon,
    labelKey: "leaderboards.menu.triggerRewards",
  },
  finish: { icon: FlagIcon, labelKey: "leaderboards.menu.finish" },
  resetPoints: {
    icon: RotateCcwIcon,
    labelKey: "leaderboards.menu.resetPoints",
  },
  delete: { icon: Trash2Icon, labelKey: "actions.delete" },
} as const satisfies Record<
  LeaderboardMenuItem,
  { icon: LucideIcon; labelKey: string }
>

const STATUS_CONFIRM = {
  publish: {
    titleKey: "leaderboards.confirm.publishTitle",
    descriptionKey: "leaderboards.confirm.publishDescription",
    confirmKey: "actions.publish",
    successKey: "leaderboards.toast.published",
  },
  pause: {
    titleKey: "leaderboards.confirm.pauseTitle",
    descriptionKey: "leaderboards.confirm.pauseDescription",
    confirmKey: "leaderboards.menu.pause",
    successKey: "leaderboards.toast.paused",
  },
  start: {
    titleKey: "leaderboards.confirm.startTitle",
    descriptionKey: "leaderboards.confirm.startDescription",
    confirmKey: "leaderboards.menu.start",
    successKey: "leaderboards.toast.started",
  },
  finish: {
    titleKey: "leaderboards.confirm.finishTitle",
    descriptionKey: "leaderboards.confirm.finishDescription",
    confirmKey: "leaderboards.menu.finish",
    successKey: "leaderboards.toast.finished",
  },
} as const satisfies Record<
  LeaderboardStatusChange,
  {
    titleKey: string
    descriptionKey: string
    confirmKey: string
    successKey: string
  }
>

type OpenDialog =
  | { kind: "status"; action: LeaderboardStatusChange }
  | { kind: "resetPoints" | "delete" | "export" | "triggerRewards" }
  | null

/** Row "⋮" menu: only the actions the leaderboard's status allows. */
export function LeaderboardRowMenu({
  workspaceId,
  leaderboard,
}: {
  workspaceId: string
  leaderboard: LeaderboardRow
}) {
  const t = useTranslations()
  const router = useRouter()
  const { handleCopy } = useClipboard()
  const invalidateLeaderboards = useInvalidateLeaderboards()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const items = buildLeaderboardMenu(leaderboard.availableActions)
  const basePath = `/space/${workspaceId}/leaderboards/${leaderboard.id}`

  const afterMutation = (message: string) => {
    toast.success(message)
    setDialog(null)
    invalidateLeaderboards()
    router.refresh()
  }
  const onError = ({ error }: { error: { serverError?: string } }) => {
    toast.error(error.serverError ?? t("messages.error"))
  }

  const boundStatus = useMemo(
    () => changeLeaderboardStatusAction.bind(null, workspaceId, leaderboard.id),
    [workspaceId, leaderboard.id],
  )
  const statusAction = useAction(boundStatus, {
    onSuccess: ({ input }) =>
      afterMutation(t(STATUS_CONFIRM[input.action].successKey)),
    onError,
  })
  const boundReset = useMemo(
    () => resetLeaderboardPointsAction.bind(null, workspaceId, leaderboard.id),
    [workspaceId, leaderboard.id],
  )
  const resetAction = useAction(boundReset, {
    onSuccess: () => afterMutation(t("leaderboards.toast.pointsReset")),
    onError,
  })
  const boundDelete = useMemo(
    () => deleteLeaderboardAction.bind(null, workspaceId, leaderboard.id),
    [workspaceId, leaderboard.id],
  )
  const deleteAction = useAction(boundDelete, {
    onSuccess: () =>
      afterMutation(
        t("messages.deletedSuccess", {
          feature: t("leaderboards.feature"),
        }),
      ),
    onError,
  })

  const handleSelect = (item: LeaderboardMenuItem) => {
    switch (item) {
      case "edit":
        router.push(`${basePath}/edit`)
        return
      case "viewParticipants":
        router.push(`${basePath}/participants`)
        return
      case "copyLink":
        handleCopy(leaderboard.viewUrl)
        return
      case "publish":
      case "pause":
      case "start":
      case "finish":
        setDialog({ kind: "status", action: item })
        return
      default:
        setDialog({ kind: item })
    }
  }

  const statusConfirm =
    dialog?.kind === "status" ? STATUS_CONFIRM[dialog.action] : null

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
          {items.map((item, index) => {
            const config = MENU_ITEM_CONFIG[item]
            const isDanger = DANGER_MENU_ITEMS.includes(item)
            const previous = items[index - 1]
            const showSeparator =
              isDanger &&
              previous !== undefined &&
              !DANGER_MENU_ITEMS.includes(previous)
            return (
              <Fragment key={item}>
                {showSeparator ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  onClick={() => handleSelect(item)}
                  variant={isDanger ? "destructive" : "default"}
                >
                  <config.icon />
                  {t(config.labelKey)}
                </DropdownMenuItem>
              </Fragment>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {statusConfirm && dialog?.kind === "status" ? (
        <ConfirmDialog
          confirmLabel={t(statusConfirm.confirmKey)}
          description={t(statusConfirm.descriptionKey)}
          isPending={statusAction.isPending}
          onConfirm={() => statusAction.execute({ action: dialog.action })}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          title={t(statusConfirm.titleKey)}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel={t("leaderboards.menu.resetPoints")}
        description={t("leaderboards.confirm.resetPointsDescription", {
          name: leaderboard.name,
        })}
        destructive
        isPending={resetAction.isPending}
        onConfirm={() => resetAction.execute({})}
        onOpenChange={(open) => !open && setDialog(null)}
        open={dialog?.kind === "resetPoints"}
        title={t("leaderboards.confirm.resetPointsTitle")}
      />

      <ConfirmDialog
        confirmLabel={t("actions.delete")}
        description={t("messages.deleteConfirmation", {
          feature: t("leaderboards.feature"),
        })}
        destructive
        isPending={deleteAction.isPending}
        onConfirm={() => deleteAction.execute()}
        onOpenChange={(open) => !open && setDialog(null)}
        open={dialog?.kind === "delete"}
        title={t("messages.deleteFeature", {
          feature: t("leaderboards.feature"),
        })}
      />

      {dialog?.kind === "export" ? (
        <ExportLeaderboardDialog
          leaderboardId={leaderboard.id}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          workspaceId={workspaceId}
        />
      ) : null}

      {dialog?.kind === "triggerRewards" ? (
        <TriggerRewardsDialog
          leaderboard={leaderboard}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          workspaceId={workspaceId}
        />
      ) : null}
    </>
  )
}
