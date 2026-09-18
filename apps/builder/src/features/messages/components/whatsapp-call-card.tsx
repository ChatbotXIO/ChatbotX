"use client"

import { channelTypes } from "@chatbotx.io/database/partials"
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
  PhoneIcon,
  PhoneIncomingIcon,
  PhoneMissedIcon,
  PhoneOffIcon,
  PhoneOutgoingIcon,
  SparklesIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { findContactInboxByChannel } from "@/features/conversations/utils/contact-inbox"
import { useOutboundCallMode } from "@/features/integration-whatsapp/calling/voip/use-outbound-call-mode"
import { useWhatsappCallStarter } from "@/features/integration-whatsapp/calling/voip/use-whatsapp-call-starter"
import {
  isCallSlotFree,
  useWhatsappVoipCallStore,
} from "@/features/integration-whatsapp/calling/voip/voip-call-store"
import { useOptionalWhatsappVoipCallContext } from "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context"
import { useWorkspaceId } from "@/hooks/routing"
import { createResolveCallRecordingUrl } from "../lib/resolve-call-recording-url"
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

/**
 * The agent-audit copy is direction-aware because `agentUserId` is NOT
 * "who answered" — `WhatsappCall.answeredByUserId` is also populated for a
 * business-initiated VoIP call with the INITIATING agent (see the field
 * docs on `createPendingOutbound`). A lookup object (not an inline
 * ternary/if-chain) keeps every direction's copy key auditable and makes
 * TypeScript flag a missing entry if `direction` ever grows a member.
 */
const AGENT_LABEL_KEY_BY_DIRECTION = {
  userInitiated: "answeredBy",
  businessInitiated: "calledBy",
} as const satisfies Record<MessageWhatsappCallEntity["direction"], string>

/**
 * The agent-audit line shared by both the compact (non-completed) outcome
 * row and the full completed-call card — a call an agent actually answered
 * that then failed/dropped/was terminated must show the SAME audit record a
 * completed call shows, or the audit trail silently disappears for exactly
 * the calls most worth reviewing. Rendered only when `agentName` is
 * present — a call that was never answered (missed/no-answer/rejected) has
 * no `agentName` at all and correctly renders nothing here.
 */
const CallAgentLine = ({
  agentName,
  direction,
  t,
}: {
  agentName: string
  direction: MessageWhatsappCallEntity["direction"]
  t: ReturnType<typeof useTranslations>
}) => (
  <span className="truncate text-muted-foreground text-xs">
    {t(AGENT_LABEL_KEY_BY_DIRECTION[direction], { name: agentName })}
  </span>
)

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
  /**
   * The conversation this activity message belongs to (`message.conversationId`,
   * passed by `message-item.tsx`) — feeds the "Call back" control (P4 item
   * 3) below. Falls back to the chat store's `activeConversationId` when
   * omitted, matching every other caller.
   */
  conversationId?: string
}

/**
 * Which non-completed call outcomes offer a "Call back" control, keyed by
 * DIRECTION rather than by label name — expressed on the underlying
 * status/direction so it can never silently drift from
 * `resolveWhatsappCallActivityLabelKey`'s own labeling. Matches the
 * reference behaviour: every non-completed INBOUND call (the business
 * missed/declined a customer's call) offers to call back; an outbound call
 * the business itself placed and that failed/was cancelled never does
 * (that case is deliberately not offered a call-back)
 * — `canceled` is display-only anyway (see
 * `MessageWhatsappCallEntity.status`'s doc comment) and is never call-back
 * eligible on either direction.
 */
export const CALL_BACK_STATUSES_BY_DIRECTION: Record<
  MessageWhatsappCallEntity["direction"],
  ReadonlySet<MessageWhatsappCallEntity["status"]>
> = {
  userInitiated: new Set(["failed", "rejected"]),
  businessInitiated: new Set(),
}

/**
 * Standalone so its own hooks (`useOutboundCallMode`, `useWhatsappCallStarter`)
 * only run while a call-back is actually offered — `WhatsappCallCard` itself
 * renders unconditionally for every message, most of which are not a missed
 * call. Disabled while the agent's single call slot or ring-all basket is
 * non-empty (dialing out while already engaged/ringing would either be
 * rejected by `startOutbound`'s own occupied check or confusingly queue
 * behind an active ring), and while calling is disabled for this workspace/
 * member (`voipCallContext` is `null`) it renders nothing at all — mirrors
 * `WhatsappVoipCallButton`.
 */
function WhatsappCallBackButton({
  conversationId,
  contactInboxId,
  contactName,
}: {
  conversationId: string
  contactInboxId: string
  contactName?: string | null
}) {
  const t = useTranslations("whatsapp.calls.card")
  const workspaceId = useWorkspaceId()
  // Read directly (not via `useWhatsappCallStarter`, which itself needs
  // `outboundCallMode`) so the mode query can be gated on it: with calling
  // disabled for this workspace/member the provider isn't mounted, this
  // card renders nothing (see the `voipCallContext` check below), and the
  // query firing anyway would just churn a deterministic 403 on remount.
  const voipCallContext = useOptionalWhatsappVoipCallContext()
  const outboundCallModeQuery = useOutboundCallMode(
    workspaceId,
    conversationId,
    contactInboxId,
    { enabled: Boolean(voipCallContext) },
  )
  const starter = useWhatsappCallStarter({
    conversationId,
    contactInboxId,
    contactName,
    outboundCallMode: outboundCallModeQuery.data,
  })
  // A single selector returning the derived boolean PRIMITIVE — not the
  // whole `call` object or `ringingCalls` array — so this button only
  // re-renders when busy-ness actually flips, not on every unrelated
  // field change inside an active call (e.g. the countdown ticking).
  const isBusy = useWhatsappVoipCallStore(
    (state) => !isCallSlotFree(state.call) || state.ringingCalls.length > 0,
  )

  if (!starter.voipCallContext) {
    return null
  }

  return (
    <>
      <Button
        className="h-7 gap-1.5 px-2 text-xs"
        disabled={isBusy || starter.isDialing || starter.isResolvingMode}
        onClick={starter.handleClick}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PhoneIcon aria-hidden className="size-3.5" />
        {t("callBack")}
      </Button>
      {starter.dialogs}
    </>
  )
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
  conversationId,
}: WhatsappCallCardProps) => {
  const t = useTranslations("whatsapp.calls.card")
  const locale = useLocale()
  // Reuses the existing `messages.*` keys for the missed/declined row so the
  // old `WhatsappCallActivity` copy (already translated in all 20 locales)
  // is not duplicated under a second key.
  const tMessages = useTranslations("messages")
  const workspaceId = useWorkspaceId()
  const openCallInfoSheet = useCallInfoSheetStore((state) => state.open)
  // The call is always with this message's own conversation (falls back to
  // whatever is currently active for callers that don't pass one — every
  // caller today does), so its contact and WhatsApp contact-inbox both come
  // from the same lookup — feeds both the "caller info" name shown in the
  // box AND the "Call back" control's dial target (P4 item 3).
  // Selects only STABLE references (the `conversations` array reference and
  // the `activeConversationId` primitive) — never an inline object/array
  // literal. A zustand v5 selector that returns a fresh literal on every
  // call fails `useSyncExternalStore`'s identity check on every store
  // notification, which re-triggers the selector, which returns ANOTHER
  // fresh literal — an infinite "Maximum update depth exceeded" loop for
  // every `whatsapp_call` message rendered. Everything derived from
  // `active` below is computed in the component body instead, matching the
  // established pattern in `message-head.tsx`/`contact-detail.tsx`.
  const conversations = useChatStore((state) => state.conversations)
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  )
  const active = conversations.find(
    (conversation) =>
      conversation.id === (conversationId ?? activeConversationId),
  )
  const activeConversationContactName = active?.contact?.fullName ?? null
  const whatsappContactInboxId = findContactInboxByChannel(
    active,
    channelTypes.enum.whatsapp,
  )?.id
  const resolvedConversationId = conversationId ?? active?.id ?? null
  const displayName = contactName ?? activeConversationContactName

  const resolveRecordingUrl = createResolveCallRecordingUrl({
    workspaceId,
    whatsappCallId: call.callId,
    context: "Whatsapp call card",
  })

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
    const canCallBack = CALL_BACK_STATUSES_BY_DIRECTION[call.direction].has(
      call.status,
    )
    return (
      <div className="flex flex-col items-center gap-1 py-1 text-muted-foreground text-sm">
        <div className="flex items-center justify-center gap-1.5">
          {isMissedInbound ? (
            <PhoneMissedIcon aria-hidden className="size-3.5" />
          ) : (
            <PhoneOffIcon aria-hidden className="size-3.5" />
          )}
          <span>{tMessages(labelKey)}</span>
        </div>
        {call.agentName && (
          <CallAgentLine
            agentName={call.agentName}
            direction={call.direction}
            t={t}
          />
        )}
        {canCallBack && resolvedConversationId && whatsappContactInboxId && (
          <WhatsappCallBackButton
            contactInboxId={whatsappContactInboxId}
            contactName={displayName}
            conversationId={resolvedConversationId}
          />
        )}
      </div>
    )
  }

  const DirectionIcon =
    call.direction === "businessInitiated"
      ? PhoneOutgoingIcon
      : PhoneIncomingIcon
  const hasRecording = call.hasRecording || Boolean(hasRecordingAttachment)

  return (
    <div
      className="flex w-72 flex-col gap-2 rounded-lg border bg-background p-3 text-sm shadow-sm"
      data-slot="whatsapp-call-card"
    >
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

      {call.agentName && (
        <CallAgentLine
          agentName={call.agentName}
          direction={call.direction}
          t={t}
        />
      )}

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
          if (!hasRecording && call.recordingUnavailable) {
            // Nothing is coming for this call — say so immediately rather
            // than showing "processing…" until the grace window lapses.
            return (
              <p className="text-muted-foreground text-xs">
                {t("recordingNotCaptured")}
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
