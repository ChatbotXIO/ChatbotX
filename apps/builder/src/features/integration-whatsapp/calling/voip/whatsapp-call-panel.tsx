"use client"

import { Avatar, AvatarFallback } from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  MicIcon,
  MicOffIcon,
  Minimize2Icon,
  PhoneIcon,
  PhoneOffIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useVoipRingback } from "./use-voip-ringback"
import { useVoipRingtone } from "./use-voip-ringtone"
import {
  useWhatsappVoipCallStore,
  type WhatsappVoipCall,
  WhatsappVoipCallDirection,
  WhatsappVoipCallPhase,
} from "./voip-call-store"
import { useWhatsappVoipCallContext } from "./whatsapp-voip-call-context"

/** How often the on-screen countdown/timer re-renders — cosmetic only, the
 * server enforces the real deadline/duration. */
const TICK_MS = 250

/** Seconds remaining until `deadlineAt`, clamped at zero, re-rendered on a
 * tick while `deadlineAt` is set. */
function useCountdownSeconds(deadlineAt: string | undefined): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!deadlineAt) {
      return
    }
    const interval = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(interval)
  }, [deadlineAt])

  if (!deadlineAt) {
    return 0
  }
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 1000))
}

function formatElapsed(startedAt: number): string {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/** NOT wrapped in `aria-live` — a per-second announcement of a ticking timer
 * is disruptive; the surrounding status line is announced instead. */
function CallTimer({ startedAt }: { startedAt: number }) {
  const [, forceTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 1000)
    return () => clearInterval(interval)
  }, [])
  return <span className="tabular-nums">{formatElapsed(startedAt)}</span>
}

const PREPARING_STAGE_STATUS_KEYS: Record<string, string> = {
  mic: "whatsapp.calls.panel.statusWaitingForMic",
}

function getEyebrowKey(call: WhatsappVoipCall): string {
  switch (call.phase) {
    case WhatsappVoipCallPhase.incomingRinging:
    case WhatsappVoipCallPhase.answering:
      return "whatsapp.calls.panel.eyebrowIncoming"
    case WhatsappVoipCallPhase.active:
      return "whatsapp.calls.panel.eyebrowOnCall"
    case WhatsappVoipCallPhase.ended:
      return "whatsapp.calls.panel.eyebrowCallEnded"
    default:
      return "whatsapp.calls.panel.eyebrowCalling"
  }
}

/** True for an OUTBOUND call that never reached `active` before ending —
 * Meta's "no answer" case. Derived client-side from the absence of
 * `startedAt` rather than a dedicated server status. */
function isNoAnswer(call: WhatsappVoipCall): boolean {
  return (
    call.direction === WhatsappVoipCallDirection.outbound &&
    call.startedAt === undefined
  )
}

function getStatusKey(call: WhatsappVoipCall): string {
  switch (call.phase) {
    case WhatsappVoipCallPhase.preparing:
      return (
        (call.preparingStage &&
          PREPARING_STAGE_STATUS_KEYS[call.preparingStage]) ||
        "whatsapp.calls.panel.statusPreparing"
      )
    case WhatsappVoipCallPhase.outboundDialing:
      return "whatsapp.calls.outbound.calling"
    case WhatsappVoipCallPhase.outboundRinging:
      return "whatsapp.calls.outbound.ringback"
    case WhatsappVoipCallPhase.answering:
      return "whatsapp.calls.voipConnecting"
    case WhatsappVoipCallPhase.incomingRinging:
      return "whatsapp.calls.incomingCall"
    case WhatsappVoipCallPhase.ended:
      switch (call.endedStatus) {
        case "rejected":
          return "whatsapp.calls.panel.statusDeclined"
        case "failed":
          return "whatsapp.calls.panel.statusCallFailed"
        case "connectionLost":
          return "whatsapp.calls.panel.statusConnectionLost"
        default:
          // "completed" (or a status-less handleEnded call): an outbound
          // dial that never connected is "No answer"; anything else (an
          // inbound call, or an outbound call that DID connect) is a normal
          // "Call ended" — the duration suffix is rendered separately below
          // when `startedAt` is present.
          return isNoAnswer(call)
            ? "whatsapp.calls.panel.statusNoAnswer"
            : "whatsapp.calls.panel.statusCallEnded"
      }
    default:
      return ""
  }
}

/**
 * ONE prominent call panel for EVERY VoIP phase — `preparing`, outbound
 * dialing/ringing, incoming ringing/answering, `active`, and the lingering
 * `ended` message. Replaces the earlier small floating dock and the two
 * separate outbound/incoming modals. Non-modal once `active` (no
 * focus-trapping backdrop, so the
 * agent can keep reading/scrolling the thread and taking notes during the
 * call) — only the incoming-ring phase shows a backdrop, to grab attention,
 * dropped the moment the agent answers.
 */
export function WhatsappCallPanel() {
  const t = useTranslations()
  const call = useWhatsappVoipCallStore((state) => state.call)
  const { answer, dismiss, hangup, toggleMute, dismissEnded } =
    useWhatsappVoipCallContext()
  const [isMinimized, setIsMinimized] = useState(false)

  const isOutboundDialPhase =
    call?.phase === WhatsappVoipCallPhase.outboundDialing ||
    call?.phase === WhatsappVoipCallPhase.outboundRinging
  const isIncomingPending =
    call?.phase === WhatsappVoipCallPhase.incomingRinging ||
    call?.phase === WhatsappVoipCallPhase.answering

  // Audible tones — mounted here, and ONLY here, so nothing else doubles
  // them up. Never during `preparing`.
  useVoipRingtone(call?.phase === WhatsappVoipCallPhase.incomingRinging)
  useVoipRingback(isOutboundDialPhase)

  const secondsRemaining = useCountdownSeconds(
    isIncomingPending ? call?.deadlineAt : undefined,
  )

  // A fresh call always starts expanded — the agent should see what just
  // arrived rather than a leftover minimized pill from a previous call. Keyed
  // on `whatsappCallId` (not just `phase`) so this fires whenever the call
  // becomes null OR a DIFFERENT call takes the slot — including a
  // lingering `ended` call being overwritten by a fresh ring/dial.
  // biome-ignore lint/correctness/useExhaustiveDependencies: whatsappCallId is the intentional re-arm trigger, not read in the body
  useEffect(() => {
    setIsMinimized(false)
  }, [call?.whatsappCallId])

  if (!call) {
    return null
  }

  const contactName = call.contactName ?? t("whatsapp.calls.unknownCaller")
  const initials = contactName.slice(0, 2)
  const isAnswering = call.phase === WhatsappVoipCallPhase.answering
  const isActive = call.phase === WhatsappVoipCallPhase.active
  const isEnded = call.phase === WhatsappVoipCallPhase.ended
  const isIncoming = call.phase === WhatsappVoipCallPhase.incomingRinging

  const statusKey = getStatusKey(call)

  // An inbound ring must ALWAYS show the full panel + backdrop +
  // Answer/Reject + ringtone — never honor a stale minimized state left over
  // from a previous call.
  if (isMinimized && !isIncoming) {
    return (
      <button
        aria-label={t("whatsapp.calls.panel.expand")}
        className="motion-safe:zoom-in-95 fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-b from-emerald-600 to-emerald-800 px-4 py-2 text-white shadow-lg motion-safe:animate-in"
        onClick={() => setIsMinimized(false)}
        type="button"
      >
        <Avatar className="size-6">
          <AvatarFallback className="bg-emerald-950 text-white text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="max-w-32 truncate text-sm">{contactName}</span>
        {isActive && call.startedAt !== undefined && (
          <CallTimer startedAt={call.startedAt} />
        )}
      </button>
    )
  }

  return (
    <>
      {isIncoming && (
        <div
          aria-hidden="true"
          className="motion-safe:fade-in fixed inset-0 z-40 bg-black/40 motion-safe:animate-in"
        />
      )}
      <div
        className={cn(
          "motion-safe:zoom-in-95 fixed right-6 bottom-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-none bg-gradient-to-b from-emerald-600 to-emerald-900 text-white shadow-2xl motion-safe:animate-in dark:from-emerald-700 dark:to-emerald-950",
        )}
      >
        <div className="flex items-center justify-end gap-1 px-2 pt-2">
          <Button
            aria-label={t("whatsapp.calls.panel.minimize")}
            className="size-7 text-white hover:bg-white/10 hover:text-white"
            onClick={() => setIsMinimized(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Minimize2Icon className="size-4" />
          </Button>
        </div>
        <div className="flex flex-col items-center gap-2 px-6 pt-2 pb-4 text-center">
          <span className="font-medium text-emerald-100 text-xs uppercase tracking-widest">
            {t(getEyebrowKey(call))}
          </span>
          <Avatar
            className={cn(
              "size-24 border-4 border-white/30 shadow-lg",
              !isEnded && "motion-safe:animate-pulse",
            )}
          >
            <AvatarFallback className="bg-emerald-950 text-3xl text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-2xl text-white">{contactName}</span>
          {/* aria-live on the status text only — the ticking timer below is
           * rendered outside this container so it is never re-announced
           * every second. */}
          <span aria-live="polite" className="text-emerald-100">
            {statusKey ? t(statusKey) : null}
            {/* "Call ended · mm:ss" — only when the call
             * actually connected (startedAt set); a never-answered outbound
             * dial renders the plain "No answer" status above with no
             * duration. */}
            {isEnded &&
              call.startedAt !== undefined &&
              ` · ${formatElapsed(call.startedAt)}`}
          </span>
          {isActive && call.startedAt !== undefined && (
            <span className="text-emerald-50 text-lg">
              <CallTimer startedAt={call.startedAt} />
            </span>
          )}
          {isIncomingPending && (
            <span className="text-emerald-200 text-xs tabular-nums">
              {t("whatsapp.calls.ringingCountdown", {
                seconds: secondsRemaining,
              })}
            </span>
          )}
          {call.isRecording && (
            <span className="flex items-center gap-1 text-red-200 text-xs">
              <span aria-hidden="true">●</span>
              {t("whatsapp.calls.recordingInProgress")}
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-8 px-6 pb-8">
          {isIncomingPending && (
            <>
              <div className="flex flex-col items-center gap-2">
                <Button
                  aria-label={t("whatsapp.calls.reject")}
                  className="size-16 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 disabled:opacity-70"
                  disabled={isAnswering}
                  onClick={dismiss}
                  size="icon"
                  type="button"
                >
                  <PhoneOffIcon className="size-6" />
                </Button>
                <span className="text-emerald-100 text-xs">
                  {t("whatsapp.calls.reject")}
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Button
                  aria-label={t("whatsapp.calls.answer")}
                  className="size-16 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 disabled:opacity-70"
                  disabled={isAnswering}
                  onClick={answer}
                  size="icon"
                  type="button"
                >
                  <PhoneIcon className="size-6" />
                </Button>
                <span className="text-emerald-100 text-xs">
                  {t("whatsapp.calls.answer")}
                </span>
              </div>
            </>
          )}

          {isActive && (
            <>
              <div className="flex flex-col items-center gap-2">
                <Button
                  aria-label={
                    call.isMuted
                      ? t("whatsapp.calls.card.unmute")
                      : t("whatsapp.calls.card.mute")
                  }
                  className="size-14 rounded-full bg-white/10 text-white hover:bg-white/20"
                  onClick={toggleMute}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  {call.isMuted ? (
                    <MicOffIcon className="size-5" />
                  ) : (
                    <MicIcon className="size-5" />
                  )}
                </Button>
                <span className="text-emerald-100 text-xs">
                  {call.isMuted
                    ? t("whatsapp.calls.card.unmute")
                    : t("whatsapp.calls.card.mute")}
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Button
                  aria-label={t("whatsapp.calls.panel.end")}
                  className="size-16 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
                  onClick={hangup}
                  size="icon"
                  type="button"
                >
                  <PhoneOffIcon className="size-6" />
                </Button>
                <span className="text-emerald-100 text-xs">
                  {t("whatsapp.calls.panel.end")}
                </span>
              </div>
            </>
          )}

          {!(isIncomingPending || isActive || isEnded) && (
            <div className="flex flex-col items-center gap-2">
              <Button
                aria-label={t("whatsapp.calls.panel.end")}
                className="size-16 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
                onClick={hangup}
                size="icon"
                type="button"
              >
                <PhoneOffIcon className="size-6" />
              </Button>
              <span className="text-emerald-100 text-xs">
                {t("whatsapp.calls.panel.end")}
              </span>
            </div>
          )}

          {isEnded && (
            <Button
              className="text-emerald-100 hover:bg-white/10 hover:text-white"
              onClick={dismissEnded}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("whatsapp.calls.panel.dismiss")}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
