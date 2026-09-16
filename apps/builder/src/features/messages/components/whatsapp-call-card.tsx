"use client"

import {
  type MessageWhatsappCallEntity,
  resolveWhatsappCallActivityLabelKey,
} from "@chatbotx.io/sdk"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import {
  DownloadIcon,
  FileTextIcon,
  InfoIcon,
  MoreVerticalIcon,
  PhoneIncomingIcon,
  PhoneMissedIcon,
  PhoneOffIcon,
  PhoneOutgoingIcon,
  SparklesIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { useWorkspaceId } from "@/hooks/routing"
import { useCallInfoSheetStore } from "../store/call-info-sheet-store"
import { CallAudioPlayer } from "./call-audio-player"

/**
 * Human, locale-aware "time to answer" — e.g. `9s`, `1m 30s`, `2m` in English;
 * `9 giây`, `1 phút 30 giây` in Vietnamese. Uses `Intl.NumberFormat` unit
 * style so the unit words/abbreviations come from the locale data itself,
 * never hardcoded strings. Seconds-only under a minute; minutes-only on an
 * exact minute; both otherwise.
 */
const formatAnswerWait = (locale: string, totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const asUnit = (value: number, unit: "minute" | "second"): string =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "narrow",
    }).format(value)

  if (minutes === 0) {
    return asUnit(seconds, "second")
  }
  if (seconds === 0) {
    return asUnit(minutes, "minute")
  }
  return `${asUnit(minutes, "minute")} ${asUnit(seconds, "second")}`
}

/**
 * How long after a call ends we keep showing the "recording processing…"
 * placeholder while waiting for the recording to land. Meta delivers the
 * `call_recording_available` webhook within seconds-to-minutes of hangup; if
 * nothing has arrived after this window the recording is not coming (Meta
 * declined it, the call was answered off-platform so we never asked, or the
 * pipeline failed) — the placeholder then clears instead of hanging forever.
 */
const RECORDING_PROCESSING_GRACE_MS = 10 * 60 * 1000

type WhatsappCallCardProps = {
  call: MessageWhatsappCallEntity
  contactName?: string | null
  /**
   * Whether the message carries the recording audio attachment. Used as a
   * fallback to show the player even if the `hasRecording` content-attribute
   * flag update lagged behind the attachment landing on the message.
   */
  hasRecordingAttachment?: boolean
  /**
   * When the call ended (the activity message's `createdAt`). Bounds the
   * "processing…" placeholder to {@link RECORDING_PROCESSING_GRACE_MS} so a
   * recording that never arrives can't leave the card stuck on "processing".
   */
  callEndedAt?: string | number | Date | null
}

const CallActionButton = ({
  disabled,
  hidden,
  icon,
  label,
  onClick,
  tooltip,
}: {
  disabled: boolean
  hidden?: boolean
  icon: ReactNode
  label: string
  onClick: () => void
  tooltip: string
}) => {
  if (hidden) {
    return null
  }

  const button = (
    <Button
      className="h-7 gap-1.5 px-2 text-xs"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      {icon}
      {label}
    </Button>
  )

  if (!disabled) {
    return button
  }

  return (
    <Tooltip>
      {/* A disabled native button never fires pointer events, so the
       * trigger renders a span instead — the standard base-ui pattern for a
       * tooltip on a disabled control. */}
      <TooltipTrigger render={<span className="inline-flex">{button}</span>} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The SINGLE progressive call activity card — replaces
 * the old two-message pair (a "Voice call" row + a separate
 * `whatsapp_call_recording` card). Renders directly off the finalize
 * `whatsapp_call` message's `contentAttributes`, which the worker enriches
 * in place (`hasRecording`/`hasTranscript`/`hasSummary`) as each becomes
 * available via `messageContentUpdated` (see `chat-realtime.tsx`).
 */
export const WhatsappCallCard = ({
  call,
  contactName,
  hasRecordingAttachment,
  callEndedAt,
}: WhatsappCallCardProps) => {
  const t = useTranslations("whatsapp.calls.card")
  const locale = useLocale()
  // Reuses the existing `messages.*` keys for the missed/declined row so the
  // old `WhatsappCallActivity` copy (already translated in all 20 locales)
  // is not duplicated under a second key.
  const tMessages = useTranslations("messages")
  const workspaceId = useWorkspaceId()
  const openCallInfoSheet = useCallInfoSheetStore((state) => state.open)
  // The call is always with the active conversation's contact, so fall back to
  // that name when the message row itself has no contact relation — this is
  // the "caller info" the reference UI shows in the box.
  const activeConversationContactName = useChatStore((state) => {
    const active = state.conversations.find(
      (conversation) => conversation.id === state.activeConversationId,
    )
    return active?.contact?.fullName ?? null
  })
  const displayName = contactName ?? activeConversationContactName

  const resolveRecordingUrl = async (): Promise<string> => {
    if (!call.callId) {
      throw new Error("Whatsapp call card: missing callId")
    }
    const { getCallRecordingUrlAction } = await import(
      "../actions/get-call-recording-url.action"
    )
    const result = await getCallRecordingUrlAction(workspaceId, {
      whatsappCallId: call.callId,
    })
    const url = result?.data?.url
    if (!url) {
      throw new Error("Whatsapp call card: no recording URL returned")
    }
    return url
  }

  const openSheet = (tab: "transcript" | "summary") => {
    if (call.callId) {
      openCallInfoSheet({
        whatsappCallId: call.callId,
        tab,
        durationSeconds: call.durationSeconds,
      })
    }
  }

  if (call.status !== "completed") {
    // Shares ONE outcome→label mapping with the stored snippet text
    // (`buildCallActivityText`) via `resolveWhatsappCallActivityLabelKey`, so
    // the card and the inbox preview can never disagree. Direction-aware: a
    // not-answered INBOUND call is "missed" (the business missed it); a
    // not-answered OUTBOUND call is "no answer" (the customer didn't pick up).
    const labelKey = resolveWhatsappCallActivityLabelKey(
      call.status,
      call.direction,
    )
    const isMissedInbound = labelKey === "missedVoiceCall"
    return (
      <div className="flex items-center justify-center gap-1.5 py-1 text-muted-foreground text-sm">
        {isMissedInbound ? (
          <PhoneMissedIcon aria-hidden className="size-3.5" />
        ) : (
          <PhoneOffIcon aria-hidden className="size-3.5" />
        )}
        <span>{tMessages(labelKey)}</span>
      </div>
    )
  }

  const DirectionIcon =
    call.direction === "businessInitiated"
      ? PhoneOutgoingIcon
      : PhoneIncomingIcon
  const hasRecording = call.hasRecording || Boolean(hasRecordingAttachment)

  return (
    <div className="flex w-72 flex-col gap-2 rounded-lg border bg-background p-3 text-sm shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <DirectionIcon aria-hidden className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="font-medium leading-tight">{t("audioCall")}</span>
          {call.answerSeconds !== undefined && (
            // Time-to-answer (ring wait) in human "1m 30s" form, NOT the talk
            // duration — the talk length is shown in the player's timer below.
            // Matches the reference card, where the two numbers differ.
            <span className="text-muted-foreground text-xs leading-tight">
              {formatAnswerWait(locale, call.answerSeconds)}
            </span>
          )}
        </div>
        {displayName && (
          <span className="ml-auto truncate text-muted-foreground text-xs">
            {displayName}
          </span>
        )}
      </div>

      {call.callId &&
        (() => {
          // The finalize message arrives before the recording upload
          // completes, so `callId` alone is true long before a recording
          // exists — gate the player on an actual recording (flag OR
          // attachment) so a click before it lands can't hit an empty `src`.
          if (call.recordingExpired) {
            return (
              <p className="text-muted-foreground text-xs">
                {t("recordingUnavailable")}
              </p>
            )
          }
          if (!hasRecording) {
            // Only a call that actually requested a recording will ever get
            // one. When recording was off for this call there is nothing to
            // wait for, so render no player row at all instead of a
            // "processing…" placeholder that never resolves.
            if (!call.recordingRequested) {
              return null
            }
            // A recording was requested but hasn't landed. Show "processing…"
            // only within the grace window after the call ended; past it the
            // recording is not coming (declined by Meta, answered
            // off-platform, or a pipeline failure) — clear the placeholder so
            // it can't hang on "processing" forever.
            const endedMs = callEndedAt
              ? new Date(callEndedAt).getTime()
              : Number.NaN
            const graceElapsed =
              Number.isFinite(endedMs) &&
              Date.now() - endedMs > RECORDING_PROCESSING_GRACE_MS
            if (graceElapsed) {
              return null
            }
            return (
              <p className="text-muted-foreground text-xs">
                {t("recordingProcessing")}
              </p>
            )
          }
          return (
            <div className="flex items-center gap-1">
              <CallAudioPlayer
                callId={call.callId}
                resolveUrl={resolveRecordingUrl}
                totalDurationSeconds={call.durationSeconds}
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={t("moreOptions")}
                      className="size-7 shrink-0"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <MoreVerticalIcon aria-hidden className="size-3.5" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={async () => {
                      const url = await resolveRecordingUrl().catch(() => null)
                      if (!url) {
                        return
                      }
                      // A plain `window.open` on the signed URL lets the
                      // browser play the OGG inline instead of downloading
                      // it. A programmatic `<a download>` click forces a
                      // real download.
                      const link = document.createElement("a")
                      link.href = url
                      link.download = ""
                      link.rel = "noopener noreferrer"
                      document.body.append(link)
                      link.click()
                      link.remove()
                    }}
                  >
                    <DownloadIcon aria-hidden className="size-3.5" />
                    {t("download")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openSheet("transcript")}>
                    <InfoIcon aria-hidden className="size-3.5" />
                    {t("openCallInformation")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })()}

      <div className="flex items-center gap-2 border-t pt-2">
        <CallActionButton
          // Always shown (like the reference UI): disabled with a tooltip
          // until a transcript exists, rather than hidden.
          disabled={!call.hasTranscript}
          icon={<FileTextIcon aria-hidden className="size-3.5" />}
          label={t("transcript")}
          onClick={() => openSheet("transcript")}
          tooltip={t("transcriptUnavailable")}
        />
        <CallActionButton
          // The summary is generated on demand from the sheet's "Generate
          // summary" flow, not eagerly — gating this button on `hasSummary`
          // made the very first summary unreachable, since there is never a
          // summary before the user opens the sheet and asks for one.
          // `hasTranscript` is the real precondition (the sheet needs a
          // transcript to summarize).
          disabled={!call.hasTranscript}
          icon={<SparklesIcon aria-hidden className="size-3.5" />}
          label={t("aiSummary")}
          onClick={() => openSheet("summary")}
          tooltip={t("summaryUnavailable")}
        />
      </div>
    </div>
  )
}
