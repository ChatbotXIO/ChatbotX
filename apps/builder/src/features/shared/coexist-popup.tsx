"use client"

import { Dialog, DialogContent } from "@chatbotx.io/ui/components/ui/dialog"
import { useRef } from "react"
import {
  type CoexistFlowTarget,
  CoexistStep,
} from "@/features/channel-connect/components/coexist-step"
import type { ConnectPickerChannel } from "@/features/channel-connect/lib/registry"

type CoexistPopupProps = {
  channel: ConnectPickerChannel
  workspaceId: string
  target: CoexistFlowTarget
  onDone: () => void
}

/**
 * Thin standalone wrapper around `CoexistStep` for the single-account
 * connect path. Mandatory billing gate — non-dismissable (every close
 * attempt is cancelled, no close button), same as before.
 */
export function CoexistPopup({
  channel,
  workspaceId,
  target,
  onDone,
}: CoexistPopupProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  return (
    <Dialog
      onOpenChange={(isOpen, eventDetails) => {
        if (!isOpen) {
          eventDetails.cancel()
        }
      }}
      open
    >
      <DialogContent initialFocus={titleRef} showCloseButton={false}>
        <CoexistStep
          channel={channel}
          onDone={onDone}
          target={target}
          titleRef={titleRef}
          workspaceId={workspaceId}
        />
      </DialogContent>
    </Dialog>
  )
}
