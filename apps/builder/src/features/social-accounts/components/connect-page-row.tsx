"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { CalendarClockIcon, ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { PostingScheduleDialog } from "@/features/publish-destinations/components/posting-schedule-dialog"
import { DestinationPauseHint } from "@/features/social-posts/components/destination-pause-hint"
import { DestinationStateBadge } from "@/features/social-posts/components/destination-state-badge"
import {
  type InboxProvider,
  needsReconnectAction,
  PROVIDER_LABELS,
  RECONNECT_LABEL_KEYS,
  showsViaFacebookTag,
  type VisibleDestination,
} from "../lib/connections"
import { ProviderAvatar } from "./provider-avatar"
import { ReconnectButton } from "./reconnect-button"

/**
 * One connected inbox: who it is, then on its own line whether it can publish,
 * with the single action (if any) set apart on the right.
 */
export const ConnectPageRow = ({
  canManage,
  destination,
  provider,
  readOnly,
  workspaceId,
}: {
  canManage: boolean
  destination: VisibleDestination
  provider: InboxProvider
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const name = destination.name ?? ""
  const { integrationId, profileUrl, state } = destination
  const openLabel = t("composer.openProfile", {
    name,
    network: PROVIDER_LABELS[destination.provider],
  })
  const avatar = (
    <ProviderAvatar
      avatar={destination.avatar}
      className="size-10"
      provider={destination.provider}
    />
  )

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      {profileUrl ? (
        <a
          aria-label={openLabel}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={profileUrl}
          rel="noopener noreferrer"
          tabIndex={-1}
          target="_blank"
        >
          {avatar}
        </a>
      ) : (
        avatar
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          {profileUrl ? (
            <a
              aria-label={openLabel}
              className="group/link flex min-w-0 items-center gap-1 rounded font-medium text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              href={profileUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="truncate">{name}</span>
              <ExternalLinkIcon
                aria-hidden="true"
                className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/link:opacity-100 group-focus-visible/link:opacity-100"
              />
            </a>
          ) : (
            <p className="truncate font-medium text-sm">{name}</p>
          )}
          {showsViaFacebookTag(destination) ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
              {t("composer.viaFacebook")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DestinationStateBadge className="px-2.5" state={state} />
          <DestinationPauseHint
            className="px-2.5"
            pausedUntil={destination.pausedUntil}
            pauseReason={destination.pauseReason}
          />
        </div>
      </div>
      <div className="ms-auto flex shrink-0 flex-wrap items-center gap-2">
        <Button
          onClick={() => setIsScheduleOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <CalendarClockIcon />
          {t("posts.connect.schedule.open")}
        </Button>
        {canManage && integrationId && needsReconnectAction(state) ? (
          <ReconnectButton
            disabled={readOnly}
            integrationId={integrationId}
            label={t(RECONNECT_LABEL_KEYS[state])}
            name={name}
            provider={provider}
            workspaceId={workspaceId}
          />
        ) : null}
      </div>
      {isScheduleOpen ? (
        <PostingScheduleDialog
          destinationId={destination.id}
          name={name}
          onOpenChange={setIsScheduleOpen}
          open={isScheduleOpen}
          readOnly={readOnly}
          workspaceId={workspaceId}
        />
      ) : null}
    </li>
  )
}
