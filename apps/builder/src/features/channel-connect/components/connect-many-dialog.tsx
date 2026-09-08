"use client"

import { Dialog, DialogContent } from "@chatbotx.io/ui/components/ui/dialog"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import type { RefObject } from "react"
import {
  type ConnectDialogExtraStep,
  useConnectDialogSteps,
} from "../hooks/use-connect-dialog-steps"
import type { ConnectPickerItem } from "../lib/picker-items"
import type { ConnectPickerChannel } from "../lib/registry"
import type { ConnectActionResultWire } from "../schema"
import { CONNECT_DIALOG_WIDTH_CLASS } from "./connect-picker-card"

export type { ConnectDialogExtraStep } from "../hooks/use-connect-dialog-steps"

export type ConnectManyDialogProps<TItem extends ConnectPickerItem> = {
  channel: ConnectPickerChannel
  workspaceId: string
  items: readonly TItem[]
  connectOne: (item: TItem) => Promise<ConnectActionResultWire>
  /** Reached once every step is done (or skipped). Never navigates itself. */
  onFinished: () => void
  /** "Close" (nothing connected, or a session error) — back to the picker. */
  onClose: () => void
  /** Channel-supplied steps appended after "connecting" — table-driven so no channel is hard-coded here (WhatsApp verification/manualResult, phase 5). */
  extraSteps?: ConnectDialogExtraStep[]
  /** Focus returns here on the Close path (the picker's own Continue button). */
  finalFocusRef?: RefObject<HTMLElement | null>
  /**
   * WhatsApp only — its workspace only exists once a number has connected, so
   * it resolves the id at call time (and yields `undefined` until then).
   * Every other channel falls back to the `workspaceId` prop.
   */
  resolveCoexistWorkspaceId?: () => string | undefined
}

export function ConnectManyDialog<TItem extends ConnectPickerItem>({
  channel,
  workspaceId,
  items,
  connectOne,
  onFinished,
  onClose,
  extraSteps = [],
  finalFocusRef,
  resolveCoexistWorkspaceId,
}: ConnectManyDialogProps<TItem>) {
  const t = useTranslations()
  const { steps, currentStep, titleRef, stepContext } = useConnectDialogSteps({
    channel,
    connectOne,
    extraSteps,
    finalFocusRef,
    items,
    onClose,
    onFinished,
    resolveCoexistWorkspaceId: resolveCoexistWorkspaceId ?? (() => workspaceId),
  })

  const stepper = steps.length > 1 && (
    <ol
      aria-label={t("channels.connectMany.progressLabel")}
      className="flex items-center gap-1.5 text-xs"
      data-slot="connect-dialog-stepper"
    >
      {steps.map((step) => (
        <li
          aria-current={step.id === currentStep.id ? "step" : undefined}
          className={cn(
            "rounded-full px-2 py-0.5",
            step.id === currentStep.id
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground",
          )}
          key={step.id}
        >
          {t(step.labelKey)}
        </li>
      ))}
    </ol>
  )

  const body = currentStep.render(stepContext)
  const footer = currentStep.renderFooter?.(stepContext) ?? null

  return (
    <Dialog
      onOpenChange={(isOpen, eventDetails) => {
        if (!isOpen) {
          // Non-dismissable by design — the dialog closes only via its own
          // buttons (Cancel remaining never closes it; Close/Continue call
          // the flow's completion through the caller).
          eventDetails.cancel()
        }
      }}
      open
    >
      <DialogContent
        className={CONNECT_DIALOG_WIDTH_CLASS}
        finalFocus={finalFocusRef}
        initialFocus={titleRef}
        showCloseButton={false}
      >
        {stepper}
        {body}
        {footer}
      </DialogContent>
    </Dialog>
  )
}
