"use client"

import type { TemplateChannel } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import {
  getChannelIcon,
  INBOX_ICON_CONFIG,
} from "@/features/inboxes/components/inbox-icon"

const TAB_CLASS_NAME =
  "inline-flex h-9 min-w-32 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-4 font-medium text-sm transition focus-visible:outline-2 focus-visible:outline-ring"

/** "All channels" is centered and never shrinks; a channel's icon + label start at the inline start (right in RTL). */
const ALL_CHANNELS_TAB_CLASS_NAME = "shrink-0 justify-center"
const CHANNEL_TAB_CLASS_NAME = "justify-start"

/**
 * The store's channel filter: a segmented control with "All channels" first,
 * then one tab per channel the catalog carries (the caller passes only those).
 * Wraps onto further rows when the width runs out; tabs share a minimum width
 * so they look equal, and a longer translated label grows its tab. "All
 * channels" stays on its own beside the channels from `sm` up, so wrapped rows start under
 * the first channel; on a phone the channels drop below it at full width.
 */
export function StoreChannelTabs({
  channels,
  activeChannel,
  onSelect,
}: {
  channels: readonly TemplateChannel[]
  /** `undefined` = all channels. */
  activeChannel: TemplateChannel | undefined
  onSelect: (channel: TemplateChannel | undefined) => void
}) {
  const t = useTranslations()
  if (channels.length === 0) {
    return null
  }
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{t("templateStore.store.channel")}</legend>
      <div className="flex flex-wrap items-start gap-1 rounded-xl p-1 sm:flex-nowrap">
        <ChannelTab
          className={ALL_CHANNELS_TAB_CLASS_NAME}
          isActive={activeChannel === undefined}
          onSelect={() => onSelect(undefined)}
        >
          {t("templateStore.store.allChannels")}
        </ChannelTab>
        <div className="flex min-w-0 flex-1 basis-full flex-wrap gap-1 sm:basis-0">
          {channels.map((channel) => {
            const Icon = getChannelIcon(channel)
            return (
              <ChannelTab
                className={CHANNEL_TAB_CLASS_NAME}
                isActive={channel === activeChannel}
                key={channel}
                onSelect={() => onSelect(channel)}
              >
                {/* The brand icon names itself (its own title); the label is the tab's name. */}
                <span aria-hidden="true" className="flex">
                  <Icon className="size-4" />
                </span>
                {t(INBOX_ICON_CONFIG[channel].defaultLabelKey)}
              </ChannelTab>
            )
          })}
        </div>
      </div>
    </fieldset>
  )
}

function ChannelTab({
  className,
  isActive,
  onSelect,
  children,
}: {
  className?: string
  isActive: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      aria-pressed={isActive}
      className={cn(
        TAB_CLASS_NAME,
        className,
        isActive
          ? "bg-background text-foreground shadow-xs ring-1 ring-border"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onSelect}
      type="button"
    >
      {children}
    </button>
  )
}
