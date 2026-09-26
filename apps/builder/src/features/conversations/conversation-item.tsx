"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { formatDistanceToNowStrict } from "date-fns"
import {
  MailIcon,
  MessageCircleMoreIcon,
  PhoneIcon,
  PhoneIncomingIcon,
  PhoneMissedIcon,
  PhoneOffIcon,
  PhoneOutgoingIcon,
  StarIcon,
  UsersRoundIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useUserAvatarUrl } from "@/lib/auth/avatar"
import { useChatStore } from "../chat/store/chat-store-provider"
import { useAvatarUrl } from "../contacts/utils"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { useWhatsappVoipCallStore } from "../integration-whatsapp/calling/voip/voip-call-store"
import { useOptionalWhatsappVoipCallContext } from "../integration-whatsapp/calling/voip/whatsapp-voip-call-context"
import { useMarkConversationRead } from "./hooks/use-mark-conversation-read"
import { isConversationUnread } from "./lib/is-conversation-unread"
import {
  type CallPreviewKind,
  resolveCallPreviewKind,
  resolveLastMessagePreview,
} from "./queries/resolve-last-message-preview"
import type { ListConversationItemResource } from "./schema/resource"
import { adBadgeLabelKey, selectAdBadge } from "./utils/ad-badge"

// Icon shown next to a call preview snippet. Mirrors whatsapp-call-card.tsx's
// icon choices so the preview and the card agree per call outcome.
const CALL_PREVIEW_ICON_BY_KIND: Record<CallPreviewKind, typeof PhoneIcon> = {
  completedInbound: PhoneIncomingIcon,
  completedOutbound: PhoneOutgoingIcon,
  missedVoiceCall: PhoneMissedIcon,
  unansweredVoiceCall: PhoneOffIcon,
  declinedVoiceCall: PhoneOffIcon,
  canceledVoiceCall: PhoneOffIcon,
}

type ConversationItemProps = {
  assigneeOptionNameByValue: ReadonlyMap<string, string>
  conversation: ListConversationItemResource
  onSelect: () => void
}

const assignedIcon = (
  conversation: ListConversationItemResource,
  assignedAvatarUrl: string | undefined,
  assignedUserOptionName: string | null,
  assignedInboxTeamOptionName: string | null,
  t: ReturnType<typeof useTranslations>,
) => {
  if (conversation.assignedUserId) {
    const assignedUserName =
      conversation.assignedUser?.name ||
      conversation.assignedUser?.email ||
      assignedUserOptionName ||
      t("assignAdmin.user")

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Avatar className="size-4">
              <AvatarImage src={assignedAvatarUrl ?? ""} />

              <AvatarFallback className="text-[0.5rem]">
                {assignedUserName.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
          }
        />
        <TooltipContent align="center" side="bottom">
          {t("assignAdmin.assignedTo", { name: assignedUserName })}
        </TooltipContent>
      </Tooltip>
    )
  }
  if (conversation.assignedInboxTeamId) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="overflow-hidden rounded-full border border-zinc-600 bg-secondary">
              <UsersRoundIcon size={16} strokeWidth={1} />
            </div>
          }
        />
        <TooltipContent align="center" side="bottom">
          {t("assignAdmin.assignedTo", {
            name:
              conversation.assignedInboxTeam?.name ??
              assignedInboxTeamOptionName ??
              t("fields.team.label"),
          })}
        </TooltipContent>
      </Tooltip>
    )
  }
  return
}

// Violet palette for the "Ads" pill. Applied as an inline style (not Tailwind
// classes) because the pill renders through base-ui's `TooltipTrigger
// render={...}`, which does not reliably forward utility classNames to the
// underlying element — inline style always lands.
const AD_BADGE_STYLE = {
  backgroundColor: "#ede9fe",
  borderColor: "#ddd6fe",
  color: "#6d28d9",
} as const

// Compact violet "Ads" pill shown on the conversation row's bottom line when
// the contact arrived from a Meta ad. The ad title (when present) is surfaced
// in a tooltip. Channel-specific label (CTWA/CTM/CTID) is resolved by the caller.
function AdBadgePill({
  label,
  adTitle,
}: {
  label: string
  adTitle: string | null
}) {
  const pill = (
    <Badge
      className="shrink-0 rounded px-1.5 py-0 font-medium text-[10px] leading-4"
      style={AD_BADGE_STYLE}
      variant="outline"
    >
      {label}
    </Badge>
  )

  if (!adTitle) {
    return pill
  }

  return (
    <Tooltip>
      <TooltipTrigger render={pill} />
      <TooltipContent align="center" side="top">
        {adTitle}
      </TooltipContent>
    </Tooltip>
  )
}

export default function ConversationItem({
  assigneeOptionNameByValue,
  conversation,
  onSelect,
}: ConversationItemProps) {
  const t = useTranslations()
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  )
  const isActive = conversation.id === activeConversationId
  // Narrowed to the matching call's id (not a boolean) so Answer/Reject can
  // target the right offer, while still only re-rendering this row when its
  // own match appears or disappears.
  const ringingCallId = useWhatsappVoipCallStore(
    (state) =>
      state.ringingCalls.find(
        (ringing) => ringing.conversationId === conversation.id,
      )?.whatsappCallId,
  )
  const isRinging = ringingCallId !== undefined
  // null when calling is disabled for this workspace/member (the provider is
  // not mounted) — the ringing overlay never renders in that case, since
  // ringingCallId would never be set either.
  const voipCallContext = useOptionalWhatsappVoipCallContext()
  const isComment = conversation.messages?.[0]?.type === "comment"
  const avatarUrl = useAvatarUrl(conversation.contact)
  const assignedAvatarUrl = useUserAvatarUrl(conversation.assignedUser?.image)
  const assignedUserOptionName =
    assigneeOptionNameByValue.get(`u_${conversation.assignedUserId}`) ?? null
  const assignedInboxTeamOptionName =
    assigneeOptionNameByValue.get(`t_${conversation.assignedInboxTeamId}`) ??
    null
  const previewText = resolveLastMessagePreview(conversation.messages?.[0], t)
  const callPreviewKind = resolveCallPreviewKind(conversation.messages?.[0])
  const CallPreviewIcon = callPreviewKind
    ? CALL_PREVIEW_ICON_BY_KIND[callPreviewKind]
    : undefined
  const isUnread = isConversationUnread(conversation)
  // Show one "Ads" badge if ANY of this conversation's contactInboxes came
  // from a Meta ad (WhatsApp CTWA or Messenger/Instagram CTM/CTID) — mirrors
  // WATI's "CTWA" tag. `adReferral` is computed server-side per contactInbox
  // (see `resolveAdReferral`); `selectAdBadge` picks the first non-empty
  // adTitle for the tooltip independently of which inbox triggered the badge.
  const adBadge = selectAdBadge(conversation.contactInboxes)

  const contactAvatar = useMemo(
    () => (
      <Avatar
        className={cn("h-12 w-12", isUnread && "border-2 border-primary")}
      >
        <AvatarImage
          alt={conversation.contact?.fullName ?? ""}
          className="object-cover"
          src={avatarUrl}
        />
        <AvatarFallback className="bg-gray-300 dark:bg-zinc-100 dark:text-zinc-800">
          {conversation.contact?.fullName?.slice(0, 2)}
        </AvatarFallback>
      </Avatar>
    ),
    [conversation.contact, avatarUrl, isUnread],
  )

  const markConversationRead = useMarkConversationRead()

  // biome-ignore lint/correctness/useExhaustiveDependencies: only the active transition triggers a read
  useEffect(() => {
    if (isActive) {
      markConversationRead(conversation)
    }
  }, [isActive])

  return (
    <div className="relative w-full">
      <Button
        className={cn(
          "h-auto w-full justify-center px-3 py-2 font-normal hover:bg-zinc-200 hover:text-foreground dark:hover:bg-muted",
          isActive ? "bg-zinc-200 dark:bg-muted!" : "",
        )}
        onClick={() => {
          onSelect()
          if (isActive) {
            markConversationRead(conversation)
          }
        }}
        type="button"
        variant={isActive ? "secondary" : "ghost"}
      >
        <div className="relative">
          {contactAvatar}
          <div className="absolute start-0 bottom-0 transform">
            {assignedIcon(
              conversation,
              assignedAvatarUrl,
              assignedUserOptionName,
              assignedInboxTeamOptionName,
              t,
            )}
          </div>
          <div className="absolute end-0 bottom-0 transform">
            {conversation.contactInboxes?.map((contactInbox) => (
              <Tooltip key={contactInbox.id}>
                <TooltipTrigger
                  render={
                    <span>
                      <InboxIcon
                        channel={contactInbox.channel as ChannelType}
                        showLabel={false}
                        size="small"
                      />
                    </span>
                  }
                />
                <TooltipContent align="center" side="right">
                  {contactInbox.inbox.name}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          {conversation.followed && (
            <div className="absolute end-0 top-0 transform">
              <StarIcon className="fill-yellow-400 text-zinc-500" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span
              className={cn(
                "truncate text-start",
                isUnread
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground",
              )}
            >
              {conversation.contact?.fullName}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    {isComment ? (
                      <MessageCircleMoreIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <MailIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </span>
                }
              />
              <TooltipContent align="center" side="top">
                {isComment
                  ? t("fields.comment.label")
                  : t("fields.directMessage.label")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div
            className={cn(
              "flex w-full items-center gap-1 truncate text-start text-xs",
              isUnread ? "font-semibold" : "text-gray-500",
            )}
          >
            {CallPreviewIcon && (
              <CallPreviewIcon aria-hidden className="size-3 shrink-0" />
            )}
            <span className="truncate">{previewText}</span>
          </div>
          <div className="flex items-center justify-between gap-1 text-xs">
            {adBadge ? (
              <AdBadgePill
                adTitle={adBadge.adTitle}
                label={t(adBadgeLabelKey(adBadge.channel))}
              />
            ) : (
              <span />
            )}
            <span className="text-neutral-400">
              {conversation.lastActivityAt
                ? formatDistanceToNowStrict(conversation.lastActivityAt)
                : " "}
            </span>
          </div>
        </div>
      </Button>
      {isRinging && voipCallContext && (
        // Overlay sibling of the row <Button>, never a descendant — a <button>
        // nested inside another <button> is invalid DOM and trips hydration.
        // Mirrors the avatar's absolute overlay pattern above, anchored to the
        // row's end edge instead.
        <div className="absolute inset-y-0 end-3 z-10 flex items-center gap-1.5">
          <Badge className="animate-pulse" variant="destructive">
            {t("whatsapp.calls.ringingBadge")}
          </Badge>
          <Button
            aria-label={t("whatsapp.calls.reject")}
            className="size-7 rounded-full bg-red-600 text-white hover:bg-red-700"
            onClick={(event) => {
              event.stopPropagation()
              if (ringingCallId) {
                voipCallContext.dismiss(ringingCallId)
              }
            }}
            size="icon"
            type="button"
          >
            <PhoneOffIcon className="size-3.5" />
          </Button>
          <Button
            aria-label={t("whatsapp.calls.answer")}
            className="size-7 rounded-full bg-green-600 text-white hover:bg-green-700"
            onClick={(event) => {
              event.stopPropagation()
              if (ringingCallId) {
                voipCallContext.answer(ringingCallId)
              }
            }}
            size="icon"
            type="button"
          >
            <PhoneIcon className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
