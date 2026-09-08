"use client"

import { DialogFooter } from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import type { ReactNode, RefObject } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ConnectingStepBody,
  ConnectingStepFooter,
} from "../components/connecting-step"
import { coexistUnavailable, setCoexist } from "../lib/coexist-client"
import type { MessageKey } from "../lib/message-key"
import type { ConnectPickerItem } from "../lib/picker-items"
import {
  CONNECT_CHANNEL_REGISTRY,
  type ConnectPickerChannel,
} from "../lib/registry"
import { SESSION_ERRORS_SKIPPING_EXTRA_STEPS } from "../lib/row-status"
import type { ConnectActionResultWire, ConnectOutcome } from "../schema"
import {
  type ConnectAfterConnect,
  type UseConnectBatchResult,
  useConnectBatch,
} from "./use-connect-batch"

/**
 * Everything a step may need from the dialog at render time. Navigation only
 * reaches the steps through this context (never by closing over hook
 * locals), so the step table can be built before any navigation exists and
 * `steps.length` stays the single source for "is this the last step".
 * Not exported — only used internally to type `ConnectDialogStep` below.
 */
type ConnectDialogStepContext = {
  outcomes: ConnectOutcome[]
  titleRef: RefObject<HTMLHeadingElement | null>
  /** Advances to the next step, or finishes the sequence from the last one. */
  onNext: () => void
  /**
   * The dialog is on its way out (`onFinished`/`onClose` already fired).
   * Every leaving control renders disabled from here on — navigation is not
   * instant, and a second click would fire a second redirect.
   */
  isLeaving: boolean
  /** The "connecting" footer's Continue: like `onNext`, but finishes immediately on a session error no extra step could survive. */
  onContinue: () => void
  continueLabel: string
  /** "Close" (nothing connected, or a session error) — back to the picker. */
  onClose: () => void
}

/**
 * One step in the dialog's sequence: the built-in "connecting" step and every
 * channel-supplied extra step (WhatsApp verification/manualResult, phase 5)
 * share this one shape — `steps[stepIndex].render(ctx)` is the entire
 * body-selection logic, no per-step branching. `isApplicable` only matters for
 * extra steps; the built-in one is always present. `renderFooter` is only
 * defined by the "connecting" step — every extra step renders its own
 * `DialogFooter` internally. Not exported — only `ConnectDialogExtraStep`
 * (the alias below) is a public type.
 */
type ConnectDialogStep = {
  id: string
  labelKey: MessageKey
  isApplicable?: (outcomes: ConnectOutcome[]) => boolean
  render: (ctx: ConnectDialogStepContext) => ReactNode
  renderFooter?: (ctx: ConnectDialogStepContext) => ReactNode
}

/**
 * Channel-supplied extra steps — same shape as `ConnectDialogStep`, except
 * `isApplicable` is required (an extra step with no predicate would always
 * show, an implicit rule only the built-in step is allowed to rely on) and
 * `renderFooter` isn't exposed (every extra step renders its own
 * `DialogFooter` internally).
 */
export type ConnectDialogExtraStep = Omit<
  ConnectDialogStep,
  "isApplicable" | "renderFooter"
> & {
  isApplicable: (outcomes: ConnectOutcome[]) => boolean
}

export type UseConnectDialogStepsOptions<TItem extends ConnectPickerItem> = {
  channel: ConnectPickerChannel
  items: readonly TItem[]
  connectOne: (item: TItem) => Promise<ConnectActionResultWire>
  /** Reached once every step is done (or skipped). Never navigates itself. */
  onFinished: () => void
  /** "Close" (nothing connected, or a session error) — back to the picker. */
  onClose: () => void
  /** Channel-supplied steps appended after "connecting" — table-driven so no channel is hard-coded here (WhatsApp verification/manualResult, phase 5). */
  extraSteps: ConnectDialogExtraStep[]
  /** Focus returns here on the Close path (the picker's own Continue button). */
  finalFocusRef?: RefObject<HTMLElement | null>
  /**
   * Reads the workspace the coexist route is called on. A function because
   * WhatsApp's workspace is created by the connect itself, so it is not known
   * when this dialog first renders; every other channel closes over the id it
   * already has. Returning `undefined` surfaces as a coexist failure on that
   * row — never as a silent skip, and never as a POST to an empty workspace
   * path.
   */
  resolveCoexistWorkspaceId: () => string | undefined
}

/**
 * Owns everything `ConnectManyDialog` needs to decide which step is showing
 * and how to move between them: the connect batch itself (including the
 * per-row coexist call the picker's switches asked for), the step table
 * (connecting → channel-supplied extra steps), the current step index, the
 * title-focus-on-step-change effect and the Continue handler. The dialog
 * component is left with only the `Dialog`/`DialogContent` shell and the
 * stepper strip.
 */
/**
 * The per-row coexist call the picker's switches asked for.
 *
 * The batch is already running by the time the dialog re-renders, so this
 * callback must keep ONE identity for the whole run — the latest workspace
 * resolver and translator are read through a ref instead of being captured.
 */
function useCoexistAfterConnect<TItem extends ConnectPickerItem>({
  channel,
  resolveCoexistWorkspaceId,
}: Pick<
  UseConnectDialogStepsOptions<TItem>,
  "channel" | "resolveCoexistWorkspaceId"
>): ConnectAfterConnect<TItem> {
  const t = useTranslations()
  const latest = useRef({ resolveCoexistWorkspaceId, t })
  latest.current = { resolveCoexistWorkspaceId, t }

  return useCallback<ConnectAfterConnect<TItem>>(
    (item, outcome) => {
      const current = latest.current
      const workspaceId = current.resolveCoexistWorkspaceId()
      const translate = (key: MessageKey) => current.t(key)

      // Falsy (not just `undefined`) so a resolver returning "" never reaches
      // the coexist procedure, whose workspace authorization would reject it
      // as an opaque failure instead of the explicit "sync did not start".
      if (!workspaceId) {
        return Promise.resolve(coexistUnavailable(translate))
      }

      return setCoexist({
        workspaceId,
        channel,
        integrationId: outcome.integrationId,
        enabled: true,
        // Per row, from that row's own switch.
        aiReadsSyncedHistory: item.aiReadsSyncedHistory ?? false,
        t: translate,
      })
    },
    [channel],
  )
}

/** The dialog's built-in first step: the row list plus its footer. */
function buildConnectingStep<TItem extends ConnectPickerItem>({
  batch,
  channel,
  finished,
  items,
  onRetryOne,
  onRetryFailed,
}: {
  batch: UseConnectBatchResult
  channel: ConnectPickerChannel
  finished: boolean
  items: readonly TItem[]
  onRetryOne: (id: string) => void
  onRetryFailed: () => void
}): ConnectDialogStep {
  return {
    id: "connecting",
    labelKey: "channels.connectMany.stepConnecting",
    render: (ctx) => (
      <ConnectingStepBody
        batch={batch}
        channel={channel}
        finished={finished}
        items={items}
        onRetryOne={onRetryOne}
        titleRef={ctx.titleRef}
      />
    ),
    renderFooter: (ctx) => (
      <DialogFooter>
        <ConnectingStepFooter
          batch={batch}
          continueLabel={ctx.continueLabel}
          finished={finished}
          isLeaving={ctx.isLeaving}
          onClose={ctx.onClose}
          onContinue={ctx.onContinue}
          onRetryFailed={onRetryFailed}
        />
      </DialogFooter>
    ),
  }
}

/**
 * Which step is showing and the one-way trip out of the dialog.
 *
 * `leave` carries one flag for the whole dialog rather than a per-button one:
 * leaving is a property of the dialog, not of whichever control triggered it.
 * The ref is the synchronous half — two clicks in the same tick both read the
 * state before React re-renders.
 */
function useStepNavigation({
  steps,
  fallbackStep,
  onFinished,
}: {
  steps: ConnectDialogStep[]
  fallbackStep: ConnectDialogStep
  onFinished: () => void
}) {
  const leavingRef = useRef(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  const leave = (run: () => void) => {
    if (leavingRef.current) {
      return
    }
    leavingRef.current = true
    setIsLeaving(true)
    run()
  }

  const isLastStep = stepIndex >= steps.length - 1

  /** Every step — built-in or channel-supplied — ends with this one call. */
  const advanceOrFinish = () => {
    if (isLastStep) {
      leave(onFinished)
      return
    }
    if (leavingRef.current) {
      return
    }
    setStepIndex((index) => index + 1)
  }

  return {
    isLeaving,
    leave,
    isLastStep,
    currentStep: steps[stepIndex] ?? fallbackStep,
    advanceOrFinish,
  }
}

/** Starts the batch exactly once per mount, even under React strict mode. */
function useAutoStartBatch(run: () => Promise<void>): void {
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) {
      return
    }
    hasStarted.current = true
    run()
  }, [run])
}

/**
 * `initialFocus` on the dialog already places focus on open; every subsequent
 * step change moves it to the new step's title.
 */
function useFocusOnStepChange(
  titleRef: RefObject<HTMLHeadingElement | null>,
  stepId: string,
): void {
  const isFirstRender = useRef(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally scoped to stepId only.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    titleRef.current?.focus()
  }, [stepId])
}

export function useConnectDialogSteps<TItem extends ConnectPickerItem>({
  channel,
  items,
  connectOne,
  onFinished,
  onClose,
  extraSteps,
  finalFocusRef,
  resolveCoexistWorkspaceId,
}: UseConnectDialogStepsOptions<TItem>) {
  const t = useTranslations()
  const afterConnect = useCoexistAfterConnect<TItem>({
    channel,
    resolveCoexistWorkspaceId,
  })

  const batch = useConnectBatch({
    items,
    concurrency: CONNECT_CHANNEL_REGISTRY[channel].concurrency,
    connectOne,
    afterConnect,
  })

  useAutoStartBatch(batch.run)

  // `batch.done` only advances once at least one row has settled, so it
  // already implies the batch has started — no need to also read the
  // mount-guard ref during render.
  const finished = !batch.isRunning && batch.done > 0
  // `batch.outcomes` is itself one stable array per settle (useConnectBatch
  // memoizes it), so this derivation needs no memo of its own to avoid a
  // fresh identity on every unrelated re-render.
  const applicableExtraSteps = extraSteps.filter((step) =>
    step.isApplicable(batch.outcomes),
  )
  const titleRef = useRef<HTMLHeadingElement>(null)

  const retryOne = (id: string) => batch.retry([id])
  const retryFailed = () => batch.retry(batch.retryableIds)

  const connectingStep = buildConnectingStep({
    batch,
    channel,
    finished,
    items,
    onRetryOne: retryOne,
    onRetryFailed: retryFailed,
  })
  // `connectingStep` is a freshly-built local every render (it closes over
  // this render's own helpers), so memoizing this array would gain nothing —
  // same reasoning as the batch-derived values above.
  const steps: ConnectDialogStep[] = [connectingStep, ...applicableExtraSteps]

  const { advanceOrFinish, currentStep, isLastStep, isLeaving, leave } =
    useStepNavigation({ steps, fallbackStep: connectingStep, onFinished })

  // The dialog's own `open` prop never toggles to `false` (it closes only by
  // the caller unmounting it after `onClose`), so Base UI's `finalFocus`
  // never gets to run its own open→closed focus-restore transition here —
  // do it ourselves before handing control back to the caller.
  const handleClose = () => {
    leave(() => {
      finalFocusRef?.current?.focus()
      onClose()
    })
  }

  // Every extra step calls workspace-authorized routes that
  // `SESSION_ERRORS_SKIPPING_EXTRA_STEPS` would be denied by, so Continue
  // must finish regardless of how many steps remain — and the button label
  // must reflect that too.
  const skipsExtraSteps =
    batch.sessionError !== null &&
    SESSION_ERRORS_SKIPPING_EXTRA_STEPS.includes(batch.sessionError)

  const handleContinue = () => {
    if (skipsExtraSteps) {
      leave(onFinished)
      return
    }
    advanceOrFinish()
  }

  const continueLabel =
    skipsExtraSteps || isLastStep
      ? t("channels.connectMany.goToChannels")
      : t("actions.continue")

  useFocusOnStepChange(titleRef, currentStep.id)

  const stepContext: ConnectDialogStepContext = {
    outcomes: batch.outcomes,
    titleRef,
    onNext: advanceOrFinish,
    onContinue: handleContinue,
    continueLabel,
    isLeaving,
    onClose: handleClose,
  }

  return {
    steps,
    currentStep,
    titleRef,
    stepContext,
  }
}
