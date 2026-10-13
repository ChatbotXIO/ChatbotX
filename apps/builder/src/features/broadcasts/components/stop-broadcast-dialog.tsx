"use client"

import { isRecurringTemplate } from "@chatbotx.io/database/partials"
import type { BroadcastModel } from "@chatbotx.io/database/types"
import { useAction } from "next-safe-action/hooks"
import { stopBroadcastAction } from "../actions/stop-broadcast.action"
import {
  BroadcastTransitionDialog,
  useBroadcastTransitionActionCallbacks,
} from "./broadcast-transition-dialog"

const CONFIG = {
  titleKey: "broadcasts.stopDialog.title",
  descriptionKey: "broadcasts.stopDialog.description",
  confirmLabelKey: "actions.stop",
  destructive: true,
}

// Stopping a repeating broadcast pauses it: no new run starts, one already
// sending carries on.
const TEMPLATE_CONFIG = {
  ...CONFIG,
  titleKey: "broadcasts.stopDialog.templateTitle",
  descriptionKey: "broadcasts.stopDialog.templateDescription",
}

export function StopBroadcastDialog({
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
    stopBroadcastAction.bind(
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
