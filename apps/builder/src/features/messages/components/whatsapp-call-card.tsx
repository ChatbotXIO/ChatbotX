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
 * Human, locale-aware duration string (e.g. 1m 30s). Uses Intl.NumberFormat
 * unit style so units come from locale data rather than hardcoded strings.
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
 * How long to show the processing placeholder after a call ends before giving
 * up on the recording arriving. Meta usually delivers call_recording_available
 * within minutes; past this window assume it's not coming (declined, answered
 * off-platform, or a pipeline failure).
 */
const RECORDING_PROCESSING_GRACE_MS = 10 * 60 * 1000

/**
 * agentUserId is not "who answered" - it's also populated with the INITIATING
 * agent for outbound VoIP calls. Copy is looked up by direction via a keyed
 * object (not inline conditionals) so TypeScript flags a missing entry.
 */
const AGENT_LABEL_KEY_BY_DIRECTION = {
  userInitiated: "answeredBy",
  businessInitiated: "calledBy",
} as const satisfies Record<MessageWhatsappCallEntity["direction"], string>

/**
 * Shared between the compact and full card so a call an agent actually answered
 * but that then failed/dropped still shows the same audit record. Rendered only
 * when agentName is present.
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
   * Fallback to show the player if the hasRecording flag lags behind the
   * attachment landing on the message.
   */
  hasRecordingAttachment?: boolean
  /**
   * When the call ended; bounds the processing placeholder to
   * RECORDING_PROCESSING_GRACE_MS.
   */
  callEndedAt?: string | number | Date | null
  /**
   * Feeds the Call back control. Falls back to the chat store's
   * activeConversationId when omitted.
   */
  conversationId?: string
}

/**
 * Keyed by direction (not label) so it can't drift from
 * resolveWhatsappCallActivityLabelKey. Every non-completed inbound call offers
 * a call back; an outbound call the business placed never does. canceled is
 * display-only and never call-back eligible either way.
 */
export const CALL_BACK_STATUSES_BY_DIRECTION: Record<
  MessageWhatsappCallEntity["direction"],
  ReadonlySet<MessageWhatsappCallEntity["status"]>
> = {
  userInitiated: new Set(["failed", "rejected"]),
  businessInitiated: new Set(),
}

/**
 * Standalone so its hooks only run while a call-back is actually offered.
 * Disabled while the agent's call slot/basket is busy, or while calling is
 * disabled for the workspace (voipCallContext null) - mirrors
 * WhatsappVoipCallButton.
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
  // Read directly rather than via useWhatsappCallStarter so the query stays
  // gated: with calling disabled the provider isn't mounted, and firing anyway
  // would just churn a deterministic 403.
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
  // Selects the derived boolean primitive, not the call object/array, so the
  // button only re-renders when busy-ness actually flips.
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
 * The single progressive call activity card, replacing the old two-message
 * pair. Renders off the finalize whatsapp_call message's contentAttributes,
 * enriched in place by the worker as hasRecording/hasTranscript/hasSummary
 * become available.
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
  // Reuses the existing messages.* keys so the old translated copy isn't
  // duplicated under a second key.
  const tMessages = useTranslations("messages")
  const workspaceId = useWorkspaceId()
  const openCallInfoSheet = useCallInfoSheetStore((state) => state.open)
  // Selects only stable references (array + primitive), never an inline
  // object/array literal - a zustand v5 selector returning a fresh literal
  // fails useSyncExternalStore's identity check and loops infinitely.
  // Everything derived from active is computed in the component body instead.
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
    // Shares one outcome-to-label mapping with the stored snippet
    // (buildCallActivityText) so they can't disagree. Direction-aware: not-
    // answered inbound is "missed"; not-answered outbound is "no answer".
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
            // Ring wait, not talk duration - the talk length is shown in the
            // player's timer below.
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
          // The finalize message arrives before the recording upload completes,
          // so callId alone doesn't mean a recording exists - gate the player
          // on flag OR attachment.
          if (call.recordingExpired) {
            return (
              <p className="text-muted-foreground text-xs">
                {t("recordingUnavailable")}
              </p>
            )
          }
          if (!hasRecording && call.recordingUnavailable) {
            // Nothing is coming - say so immediately instead of waiting out the
            // grace window.
            return (
              <p className="text-muted-foreground text-xs">
                {t("recordingNotCaptured")}
              </p>
            )
          }
          if (!hasRecording) {
            // Only a call that requested recording will ever get one; render no
            // player row when it wasn't requested.
            if (!call.recordingRequested) {
              return null
            }
            // Show processing only within the grace window; past it assume the
            // recording isn't coming.
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
                      // window.open plays the OGG inline; a programmatic <a
                      // download> click forces a real download.
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
          // Always shown, disabled with a tooltip until a transcript exists,
          // rather than hidden.
          disabled={!call.hasTranscript}
          icon={<FileTextIcon aria-hidden className="size-3.5" />}
          label={t("transcript")}
          onClick={() => openSheet("transcript")}
          tooltip={t("transcriptUnavailable")}
        />
        <CallActionButton
          // Summary is generated on demand, so gating on hasSummary would make
          // the first summary unreachable. hasTranscript is the real
          // precondition.
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
