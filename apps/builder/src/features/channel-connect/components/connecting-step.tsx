"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Progress } from "@chatbotx.io/ui/components/ui/progress"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { RefObject } from "react"
import type {
  RowState,
  UseConnectBatchResult,
} from "../hooks/use-connect-batch"
import type { ConnectPickerItem } from "../lib/picker-items"
import type { ConnectPickerChannel } from "../lib/registry"
import { CONNECT_CHANNEL_REGISTRY, CONNECT_RETRY_HREF } from "../lib/registry"
import {
  type RowVisualState,
  rowNote,
  SESSION_ERROR_MESSAGE_KEYS,
} from "../lib/row-status"
import { AccountStatusList } from "./account-status-list"
import { ConnectRowStatus } from "./connect-row-status"

function rowVisualState(row: RowState | undefined): RowVisualState {
  if (!row) {
    return "waiting"
  }
  if (row.phase === "done") {
    if (row.outcome.status === "connected") {
      return row.outcome.warning ? "connectedWarning" : "connected"
    }
    return row.outcome.status
  }
  return row.phase
}

export type ConnectingStepBodyProps<TItem extends ConnectPickerItem> = {
  channel: ConnectPickerChannel
  finished: boolean
  batch: UseConnectBatchResult
  items: readonly TItem[]
  titleRef: RefObject<HTMLHeadingElement | null>
  onRetryOne: (id: string) => void
}

/** The connecting step's title/progress/row-list body — the dialog's default step, before any channel extra step is reached. */
export function ConnectingStepBody<TItem extends ConnectPickerItem>({
  channel,
  finished,
  batch,
  items,
  titleRef,
  onRetryOne,
}: ConnectingStepBodyProps<TItem>) {
  const t = useTranslations()

  return (
    <>
      <DialogHeader>
        <DialogTitle className="mb-1" ref={titleRef} tabIndex={-1}>
          {finished
            ? t("channels.connectMany.dialogTitleDone", {
                connected: batch.connectedCount,
                total: batch.total,
              })
            : t("channels.connectMany.dialogTitleRunning", {
                count: batch.total,
                feature: t(CONNECT_CHANNEL_REGISTRY[channel].featureLabelKey),
              })}
        </DialogTitle>
        {!finished && (
          <DialogDescription>
            {t("channels.connectMany.leaveNotice")}
          </DialogDescription>
        )}
      </DialogHeader>

      <div className="flex items-center gap-3">
        <Progress
          className="motion-reduce:[&_[data-slot=progress-indicator]]:transition-none"
          value={batch.total === 0 ? 0 : (batch.done / batch.total) * 100}
        />
        <span className="shrink-0 text-muted-foreground text-xs">
          {t("channels.connectMany.progress", {
            done: batch.done,
            total: batch.total,
          })}
        </span>
      </div>
      <div aria-live="polite" className="sr-only">
        {t("channels.connectMany.progressAnnouncement", {
          done: batch.done,
          total: batch.total,
        })}
      </div>

      {batch.sessionError && (
        <Alert variant="destructive">
          <AlertTitle>
            {t(SESSION_ERROR_MESSAGE_KEYS[batch.sessionError])}
          </AlertTitle>
          <AlertDescription>
            <a
              className="underline decoration-dotted underline-offset-2"
              href={CONNECT_RETRY_HREF}
            >
              {t(CONNECT_CHANNEL_REGISTRY[channel].tryAgainKey)}
            </a>
          </AlertDescription>
        </Alert>
      )}

      <AccountStatusList
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          secondary: item.secondary,
          leading: item.leading,
        }))}
        renderTrailing={(item) => {
          const row = batch.rows.get(item.id)
          const done = row?.phase === "done" ? row : undefined
          return (
            <ConnectRowStatus
              coexist={done?.coexist}
              note={rowNote(done?.outcome)}
              onRetry={() => onRetryOne(item.id)}
              retryDisabled={batch.isRunning}
              state={rowVisualState(row)}
            />
          )
        }}
      />
    </>
  )
}

type LeavingButtonProps = {
  label: string
  onClick: () => void
  isLeaving: boolean
  variant?: "outline"
}

/**
 * A footer action that takes the operator out of the dialog. Navigation is
 * not instant, so the button spends itself on the first click — disabled
 * with the same spinner the picker's own submit uses — and a second click
 * cannot fire a second redirect (the dialog's `isLeaving` guard makes it a
 * no-op even if a click lands in the same tick).
 */
function LeavingButton({
  label,
  onClick,
  isLeaving,
  variant,
}: LeavingButtonProps) {
  return (
    <Button
      disabled={isLeaving}
      onClick={onClick}
      type="button"
      variant={variant}
    >
      {isLeaving && <Loader2Icon className="animate-spin" />}
      {label}
    </Button>
  )
}

export type ConnectingStepFooterProps = {
  finished: boolean
  batch: UseConnectBatchResult
  onRetryFailed: () => void
  onClose: () => void
  onContinue: () => void
  continueLabel: string
  /** The dialog is already leaving — every control that would navigate again is spent. */
  isLeaving: boolean
}

/** The connecting step's footer — "Cancel remaining" while running, or Retry/Close/Continue once every row has settled. */
export function ConnectingStepFooter({
  finished,
  batch,
  onRetryFailed,
  onClose,
  onContinue,
  continueLabel,
  isLeaving,
}: ConnectingStepFooterProps) {
  const t = useTranslations()

  if (!finished) {
    // "Cancel remaining" only ever cancels rows still waiting for a slot; a
    // batch no larger than the concurrency has none, and a disabled button
    // would just look broken — so the footer is empty until a row is queued.
    const hasQueued = Array.from(batch.rows.values()).some(
      (row) => row.phase === "waiting",
    )
    if (!hasQueued) {
      return null
    }
    return (
      <Button onClick={batch.cancelRemaining} type="button" variant="secondary">
        {t("channels.connectMany.cancelRemaining")}
      </Button>
    )
  }

  const hasRetryable = batch.retryableIds.length > 0
  const nothingConnected = batch.connectedCount === 0

  return (
    <>
      {hasRetryable && (
        <Button
          disabled={isLeaving}
          onClick={onRetryFailed}
          type="button"
          variant="secondary"
        >
          {t("channels.connectMany.retryFailed", {
            count: batch.retryableIds.length,
          })}
        </Button>
      )}
      {nothingConnected ? (
        <LeavingButton
          isLeaving={isLeaving}
          label={t("channels.connectMany.close")}
          onClick={onClose}
          variant="outline"
        />
      ) : (
        <>
          {batch.sessionError !== null && (
            <LeavingButton
              isLeaving={isLeaving}
              label={t("channels.connectMany.close")}
              onClick={onClose}
              variant="outline"
            />
          )}
          <LeavingButton
            isLeaving={isLeaving}
            label={continueLabel}
            onClick={onContinue}
          />
        </>
      )}
    </>
  )
}
