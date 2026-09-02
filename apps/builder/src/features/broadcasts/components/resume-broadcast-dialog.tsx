"use client"

import type { BroadcastModel } from "@chatbotx.io/database/types"
import { useAction } from "next-safe-action/hooks"
import { resumeBroadcastAction } from "../actions/resume-broadcast.action"
import {
  BroadcastTransitionDialog,
  useBroadcastTransitionActionCallbacks,
} from "./broadcast-transition-dialog"

const CONFIG = {
  titleKey: "broadcasts.resumeDialog.title",
  descriptionKey: "broadcasts.resumeDialog.description",
  confirmLabelKey: "actions.resume",
}

export function ResumeBroadcastDialog({
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
    resumeBroadcastAction.bind(
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
