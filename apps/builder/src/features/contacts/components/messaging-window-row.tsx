"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { TimerIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import {
  formatCountdown,
  hasHumanAgentPhase,
  parseLastIncomingTs,
  resolveSendWindow,
  type WindowPhaseKind,
} from "../../messages/lib/messaging-window"
import { UNKNOWN_VALUE_PLACEHOLDER } from "../lib/scoped-identity-rows"

const TICK_INTERVAL_MS = 1000

/**
 * Wall-clock `now` that re-renders once per second, but only while `active`
 * and the document is visible. Exactly one interval exists at a time and it is
 * cleared on deactivate, hide and unmount.
 */
export const useTickingNow = (active: boolean, resetKey: unknown): number => {
  const [now, setNow] = useState(() => Date.now())

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey re-syncs the clock when the inputs change
  useEffect(() => {
    setNow(Date.now())
    if (!active) {
      return
    }
    let intervalId: ReturnType<typeof setInterval> | null = null
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
    const start = () => {
      stop()
      setNow(Date.now())
      intervalId = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        start()
      } else {
        stop()
      }
    }
    if (document.visibilityState === "visible") {
      start()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [active, resetKey])

  return now
}

const openLabelKeyByPhase = {
  standard: "fields.channelProfile.messagingWindow.open",
  humanAgent: "fields.channelProfile.messagingWindow.humanAgentOpen",
} as const satisfies Record<WindowPhaseKind, string>

/**
 * Contact panel row showing the send window as the composer's gate sees it:
 * open (with a live countdown, labelled by phase), closed, unknown, or absent
 * when the channel/conversation has no window. Resolves through the same
 * `resolveSendWindow` the composer uses.
 */
export const MessagingWindowRow = ({
  channel,
  isDirect,
  lastIncomingMessageAt,
}: {
  channel: string | null | undefined
  /** False for post-comment conversations, which are not window-gated. */
  isDirect: boolean
  lastIncomingMessageAt: Date | string | null | undefined
}) => {
  const t = useTranslations()
  const lastIncomingTs = parseLastIncomingTs(lastIncomingMessageAt)
  const initialState = resolveSendWindow({
    channel,
    isDirect,
    lastIncomingTs,
    now: Date.now(),
  })
  const now = useTickingNow(
    initialState.kind === "open",
    `${channel}:${isDirect}:${lastIncomingTs}`,
  )
  const state = resolveSendWindow({ channel, isDirect, lastIncomingTs, now })

  if (state.kind === "notApplicable") {
    return null
  }

  let valueText = UNKNOWN_VALUE_PLACEHOLDER
  if (state.kind === "open") {
    valueText = t(openLabelKeyByPhase[state.phase], {
      time: formatCountdown(state.remainingMs),
    })
  } else if (state.kind === "closed") {
    valueText = t("fields.channelProfile.messagingWindow.closed")
  }
  const tooltipKey = hasHumanAgentPhase(channel)
    ? "fields.channelProfile.messagingWindow.tooltipHumanAgent"
    : "fields.channelProfile.messagingWindow.tooltip"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="flex w-full items-center gap-1"
            data-testid="messaging-window-row"
          >
            <div className="flex basis-1/3 flex-wrap items-center gap-1 truncate">
              <TimerIcon aria-hidden className="size-4" />
              <div className="flex-1 truncate dark:text-gray-400">
                {t("fields.channelProfile.messagingWindow.label")}
              </div>
            </div>
            <div
              className={`inline-flex h-8 flex-1 items-center justify-start truncate rounded-md px-3 text-[12px] tabular-nums ${
                state.kind === "open"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground"
              }`}
              data-state={state.kind}
            >
              {valueText}
            </div>
          </div>
        }
      />
      <TooltipContent>{t(tooltipKey)}</TooltipContent>
    </Tooltip>
  )
}
