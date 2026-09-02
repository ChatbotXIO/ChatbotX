"use client"

import type { BroadcastModel } from "@chatbotx.io/database/types"
import { useAction } from "next-safe-action/hooks"
import { moveBroadcastToDraftAction } from "../actions/move-broadcast-to-draft.action"
import {
  BroadcastTransitionDialog,
  useBroadcastTransitionActionCallbacks,
} from "./broadcast-transition-dialog"

const CONFIG = {
  titleKey: "broadcasts.moveToDraftDialog.title",
  descriptionKey: "broadcasts.moveToDraftDialog.description",
  confirmLabelKey: "actions.moveToDraft",
}

export function MoveBroadcastToDraftDialog({
  broadcast,
  open,
  onOpenChange,
  onSuccess,
}: {
  broadcast: BroadcastModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const callbacks = useBroadcastTransitionActionCallbacks({
    onOpenChange,
    onSuccess,
  })
  const { execute, isPending } = useAction(
    moveBroadcastToDraftAction.bind(
      null,
      broadcast?.workspaceId ?? "",
      broadcast?.id ?? "",
    ),
    callbacks,
  )

  return (
    <BroadcastTransitionDialog
      broadcast={broadcast}
      config={CONFIG}
      execute={execute}
      isPending={isPending}
      onOpenChange={onOpenChange}
      open={open}
    />
  )
}
