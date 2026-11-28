"use client"

import {
  MESSAGING_WINDOW_POLICY,
  resolveConversationMessagingWindow,
} from "@chatbotx.io/sdk"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { TimerIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { formatCountdown } from "../../messages/lib/messaging-window"
import { UNKNOWN_VALUE_PLACEHOLDER } from "../lib/scoped-identity-rows"

const TICK_INTERVAL_MS = 1000
/** The window stays open through its last millisecond, so re-render just after it. */
const BOUNDARY_SETTLE_MS = 1

/**
 * Wall-clock `now` that re-renders once per second, but only while `active`
 * and the document is visible. Exactly one interval exists at a time and it is
 * cleared on deactivate, hide and unmount. When `boundaryTs` is given, a
 * timeout also re-renders right after that instant so a phase change is not
 * delayed by up to one tick.
 */
export const useTickingNow = (
  active: boolean,
  resetKey: unknown,
  boundaryTs: number | null = null,
): number => {
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
    const boundaryTimeout =
      boundaryTs === null
        ? null
        : setTimeout(
            () => setNow(Date.now()),
            Math.max(0, boundaryTs + BOUNDARY_SETTLE_MS - Date.now()),
          )
    return () => {
      stop()
      if (boundaryTimeout !== null) {
        clearTimeout(boundaryTimeout)
      }
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [active, resetKey, boundaryTs])

  return now
}

const openLabelKeyByState = {
  open: "fields.channelProfile.messagingWindow.open",
  humanAgent: "fields.channelProfile.messagingWindow.humanAgentOpen",
} as const

/**
 * Contact panel row showing the send window as the composer's gate sees it:
 * open (with a live countdown, labelled by phase), closed, unknown, or absent
 * when the channel/conversation has no window. Resolves through the same
 * `resolveMessagingWindow` (via `resolveConversationMessagingWindow`) as the
 * composer, the API's `messagingWindow` field and the server's send gate.
 */
export const MessagingWindowRow = ({
  channel,
  sourceId,
  lastIncomingMessageAt,
}: {
  channel: string | null | undefined
  /** Set for post-comment conversations, which are not window-gated. */
  sourceId: string | null | undefined
  lastIncomingMessageAt: Date | string | null | undefined
}) => {
  const t = useTranslations()
  const resolve = (now: number) =>
    resolveConversationMessagingWindow({
      channel: channel ?? "",
      sourceId,
      lastIncomingMessageAt,
      now,
    })
  const initialState = resolve(Date.now())
  const isOpen =
    initialState.state === "open" || initialState.state === "humanAgent"
  const now = useTickingNow(
    isOpen,
    `${channel}:${sourceId}:${String(lastIncomingMessageAt)}`,
    // Looked up from just before `now`, so the boundary stays "ahead" (and its
    // timeout armed) until the settle delay after it has passed.
    resolve(Date.now() - BOUNDARY_SETTLE_MS).changesAt?.getTime() ?? null,
  )
  const windowInfo = resolve(now)

  if (
    windowInfo.state === "notApplicable" ||
    windowInfo.state === "unlimited"
  ) {
    return null
  }

  let valueText = UNKNOWN_VALUE_PLACEHOLDER
  if (windowInfo.state === "open" || windowInfo.state === "humanAgent") {
    const remainingMs = (windowInfo.changesAt?.getTime() ?? now) - now
    valueText = t(openLabelKeyByState[windowInfo.state], {
      time: formatCountdown(remainingMs),
    })
  } else if (windowInfo.state === "closed") {
    valueText = t("fields.channelProfile.messagingWindow.closed")
  }
  const channelType = channelTypes.safeParse(channel)
  const hasHumanAgentPhase =
    channelType.success &&
    MESSAGING_WINDOW_POLICY[channelType.data]?.humanAgentMs !== undefined
  const tooltipKey = hasHumanAgentPhase
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
                windowInfo.state === "open" || windowInfo.state === "humanAgent"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground"
              }`}
              data-state={windowInfo.state}
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
