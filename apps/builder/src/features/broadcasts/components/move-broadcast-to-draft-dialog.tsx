"use client"

import { isRecurringTemplate } from "@chatbotx.io/database/partials"
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

// For a repeating broadcast this is "Edit schedule": it stops the series and
// reopens it as a draft whose schedule can be changed.
const TEMPLATE_CONFIG = {
  titleKey: "broadcasts.moveToDraftDialog.templateTitle",
  descriptionKey: "broadcasts.moveToDraftDialog.templateDescription",
  confirmLabelKey: "actions.editSchedule",
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
      config={
        broadcast && isRecurringTemplate(broadcast) ? TEMPLATE_CONFIG : CONFIG
      }
      execute={execute}
      isPending={isPending}
      onOpenChange={onOpenChange}
      open={open}
    />
  )
}
