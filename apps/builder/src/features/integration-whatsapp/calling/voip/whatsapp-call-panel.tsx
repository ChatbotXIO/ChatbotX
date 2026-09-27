"use client"

import { Avatar, AvatarFallback } from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  MessageSquareTextIcon,
  MicIcon,
  MicOffIcon,
  Minimize2Icon,
  PhoneOffIcon,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { useCountdownSeconds } from "./use-countdown-seconds"
import { useVoipRingback } from "./use-voip-ringback"
import { useVoipRingtone, voipRingtoneModes } from "./use-voip-ringtone"
import { VoipBackdrop } from "./voip-backdrop"
import {
  isCallSlotFree,
  useWhatsappVoipCallStore,
  type WhatsappVoipCall,
  WhatsappVoipCallDirection,
  WhatsappVoipCallPhase,
  type WhatsappVoipEndedStatus,
} from "./voip-call-store"
import { WhatsappIncomingCallCard } from "./whatsapp-incoming-call-card"
import { WhatsappRingingCallsList } from "./whatsapp-ringing-calls-list"
import { useWhatsappVoipCallContext } from "./whatsapp-voip-call-context"

function formatElapsed(startedAt: number): string {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/**
 * Not wrapped in aria-live - a per-second ticking timer announcement is
 * disruptive; the surrounding status line is announced instead.
 */
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

/**
 * The final sentence for each way a call can end other than normally. Typed
 * over every non-`completed` status, so a new one fails to compile until it is
 * given a sentence rather than silently rendering nothing.
 */
const ENDED_STATUS_KEYS: Record<
  Exclude<WhatsappVoipEndedStatus, "completed">,
  string
> = {
  rejected: "whatsapp.calls.panel.statusDeclined",
  failed: "whatsapp.calls.panel.statusCallFailed",
  connectionLost: "whatsapp.calls.panel.statusConnectionLost",
  cannotAnswer: "whatsapp.calls.errors.voipCannotAnswer",
  callEnded: "whatsapp.calls.errors.voipCallEnded",
  micPermissionDenied: "whatsapp.calls.outbound.micPermissionDenied",
  micNotFound: "whatsapp.calls.outbound.micNotFound",
  answerFailed: "whatsapp.calls.panel.answerFailed",
}

/**
 * True for an outbound call that never reached active before ending - Meta's no
 * answer case, derived client-side from the absence of startedAt.
 */
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
      if (call.endedStatus && call.endedStatus !== "completed") {
        return ENDED_STATUS_KEYS[call.endedStatus]
      }
      // An outbound dial that never connected is No answer; anything else is
      // a normal Call ended, with the duration suffix rendered separately when
      // startedAt is present.
      return isNoAnswer(call)
        ? "whatsapp.calls.panel.statusNoAnswer"
        : "whatsapp.calls.panel.statusCallEnded"
    default:
      return ""
  }
}

/**
 * Renders the call panel plus any currently-ringing basket offers, keyed on
 * slot-free vs engaged and basket size (0 / 1 / 2+). The backdrop is never
 * shown while the slot is engaged — dimming mid-conversation is wrong.
 */
export function WhatsappCallPanel() {
  const t = useTranslations()
  const call = useWhatsappVoipCallStore((state) => state.call)
  const ringingCalls = useWhatsappVoipCallStore((state) => state.ringingCalls)
  const setPendingConversationOpen = useWhatsappVoipCallStore(
    (state) => state.setPendingConversationOpen,
  )
  const { answer, dismiss, hangup, toggleMute, dismissEnded } =
    useWhatsappVoipCallContext()
  const [isMinimized, setIsMinimized] = useState(false)

  const workspaceId = useWorkspaceId()
  const router = useRouter()
  const pathname = usePathname()
  const inboxPath = `/space/${workspaceId}/inbox`
  const isOnInbox =
    pathname === inboxPath || pathname.startsWith(`${inboxPath}/`)

  /**
   * Off the inbox, a route change lets the inbox page's mount effect pick up
   * conversationId; already on the inbox that param wouldn't re-run, so the
   * conversation is opened directly via pendingConversationOpen instead, a
   * module-level bridge ChatRealtime consumes (this panel mounts outside it).
   */
  const goToConversation = useCallback(
    (conversationId: string) => {
      if (isOnInbox) {
        setPendingConversationOpen(conversationId)
        return
      }
      router.push(`${inboxPath}?conversationId=${conversationId}`)
    },
    [isOnInbox, router, inboxPath, setPendingConversationOpen],
  )

  /**
   * Navigates to the conversation only after the answer actually succeeds -
   * shared by every Answer control so there's no per-caller if-else on where
   * the offer's conversationId comes from. answer() itself owns the "did this
   * succeed" check, including the replacement-confirm path where
   * goToConversation fires later from confirmReplacement instead.
   */
  const handleAnswer = useCallback(
    (whatsappCallId?: string) => {
      answer(whatsappCallId, goToConversation)
    },
    [goToConversation, answer],
  )

  const isOutboundDialPhase =
    call?.phase === WhatsappVoipCallPhase.outboundDialing ||
    call?.phase === WhatsappVoipCallPhase.outboundRinging
  const isIncomingPending =
    call?.phase === WhatsappVoipCallPhase.incomingRinging ||
    call?.phase === WhatsappVoipCallPhase.answering
  const slotFree = isCallSlotFree(call)

  // Audible tones mounted here only, so nothing doubles them up. An outbound
  // dial wins over a simultaneous incoming ring (both can be true at once);
  // an agent already mid-conversation gets a short call-waiting beep instead
  // of the full ring, since a repeating ring for the offer's whole deadline
  // would make their current call impossible to hold.
  const isMidConversation = !(
    slotFree || call?.phase === WhatsappVoipCallPhase.incomingRinging
  )
  useVoipRingtone(
    !isOutboundDialPhase &&
      (ringingCalls.length > 0 ||
        call?.phase === WhatsappVoipCallPhase.incomingRinging),
    isMidConversation ? voipRingtoneModes.callWaiting : voipRingtoneModes.ring,
    // Re-arms the finite call-waiting beep for each new offer; without it a
    // second arrival would be silent since active never changed. Held constant
    // for the full ring (which already repeats) to avoid tearing down and
    // rebuilding the AudioContext on every arrival.
    isMidConversation ? ringingCalls.length : 0,
  )
  useVoipRingback(isOutboundDialPhase)

  const secondsRemaining = useCountdownSeconds(
    isIncomingPending ? call?.deadlineAt : undefined,
  )
  // The single basket entry's own countdown, for the free-slot exactly-one-ring
  // case. Called unconditionally (Rules of Hooks) even when that case isn't
  // rendered.
  const singleRingingSecondsRemaining = useCountdownSeconds(
    slotFree && ringingCalls.length === 1
      ? ringingCalls[0]?.deadlineAt
      : undefined,
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

  // Free-slot basket rendering: nothing else occupies this corner, so the
  // basket itself drives what shows.
  if (slotFree && ringingCalls.length > 0) {
    if (ringingCalls.length === 1) {
      const entry = ringingCalls[0]
      if (!entry) {
        return null
      }
      const contactName = entry.contactName ?? t("whatsapp.calls.unknownCaller")
      return (
        <>
          <VoipBackdrop />
          <div className="motion-safe:zoom-in-95 fixed right-6 bottom-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-none bg-gradient-to-b from-emerald-600 to-emerald-900 text-white shadow-2xl motion-safe:animate-in dark:from-emerald-700 dark:to-emerald-950">
            <WhatsappIncomingCallCard
              contactName={contactName}
              onAnswer={() => handleAnswer(entry.whatsappCallId)}
              onReject={() => dismiss(entry.whatsappCallId)}
              secondsRemaining={singleRingingSecondsRemaining}
              statusKey="whatsapp.calls.incomingCall"
            />
          </div>
        </>
      )
    }
    return (
      <>
        {/* Sibling of the positioned wrapper, never a child of it: nested
         * inside, this `fixed z-40` overlay would paint OVER the z-50 list
         * (z-index applies only to positioned elements, and the list card is
         * not positioned) and swallow every Answer/Reject click. */}
        <VoipBackdrop />
        <div className="fixed right-6 bottom-6 z-50">
          <WhatsappRingingCallsList
            calls={ringingCalls}
            onAnswer={handleAnswer}
            onReject={(whatsappCallId) => dismiss(whatsappCallId)}
          />
        </div>
      </>
    )
  }

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

  // An inbound ring must always show the full panel + backdrop + Answer/Reject
  // + ringtone, never a stale minimized state from a previous call. The ring
  // list is still shown while minimized - hiding it here would leave an audible
  // ring with nowhere on screen to answer it.
  if (isMinimized && !isIncoming) {
    return (
      <div className="fixed right-6 bottom-6 z-50 flex max-h-[calc(100vh-3rem)] flex-col-reverse items-end gap-3">
        <button
          aria-label={t("whatsapp.calls.panel.expand")}
          className="motion-safe:zoom-in-95 flex items-center gap-2 rounded-full bg-gradient-to-b from-emerald-600 to-emerald-800 px-4 py-2 text-white shadow-lg motion-safe:animate-in"
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
        {!slotFree && ringingCalls.length > 0 && (
          <WhatsappRingingCallsList
            calls={ringingCalls}
            onAnswer={handleAnswer}
            onReject={(whatsappCallId) => dismiss(whatsappCallId)}
          />
        )}
      </div>
    )
  }

  return (
    <>
      {isIncoming && <VoipBackdrop />}
      <div className="fixed right-6 bottom-6 z-50 flex max-h-[calc(100vh-3rem)] flex-col-reverse items-end gap-3">
        <div
          className={cn(
            "motion-safe:zoom-in-95 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-none bg-gradient-to-b from-emerald-600 to-emerald-900 text-white shadow-2xl motion-safe:animate-in dark:from-emerald-700 dark:to-emerald-950",
          )}
        >
          <div className="flex items-center justify-end gap-1 px-2 pt-2">
            <Button
              aria-label={t("whatsapp.calls.panel.goToConversation")}
              className="size-7 text-white hover:bg-white/10 hover:text-white"
              onClick={() => goToConversation(call.conversationId)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MessageSquareTextIcon className="size-4" />
            </Button>
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

          {isIncomingPending ? (
            <WhatsappIncomingCallCard
              contactName={contactName}
              disabled={isAnswering}
              onAnswer={() => handleAnswer()}
              onReject={() => dismiss()}
              secondsRemaining={secondsRemaining}
              statusKey={statusKey}
            />
          ) : (
            <>
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
                  {/* The server's own reason wins when it gave one. */}
                  {(isEnded && call.endedMessage) ||
                    (statusKey ? t(statusKey) : null)}
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
                {call.isRecording && (
                  <span className="flex items-center gap-1 text-red-200 text-xs">
                    <span aria-hidden="true">●</span>
                    {t("whatsapp.calls.recordingInProgress")}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-center gap-8 px-6 pb-8">
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

                {!(isActive || isEnded) && (
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
            </>
          )}
        </div>

        {!slotFree && ringingCalls.length > 0 && (
          <WhatsappRingingCallsList
            calls={ringingCalls}
            onAnswer={handleAnswer}
            onReject={(whatsappCallId) => dismiss(whatsappCallId)}
          />
        )}
      </div>
    </>
  )
}
