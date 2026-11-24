"use client"

import type { TemplateChannel } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import {
  getChannelIcon,
  INBOX_ICON_CONFIG,
} from "@/features/inboxes/components/inbox-icon"

const TAB_CLASS_NAME =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 font-medium text-sm transition focus-visible:outline-2 focus-visible:outline-ring"

/**
 * The store's channel filter: a segmented control with "All channels" first,
 * then one tab per channel the catalog carries (the caller passes only those).
 * Scrolls sideways on a narrow screen instead of wrapping.
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
    <fieldset className="m-0 min-w-0 overflow-x-auto border-0 p-0">
      <legend className="sr-only">{t("templateStore.store.channel")}</legend>
      <div className="inline-grid w-max auto-cols-[1fr] grid-flow-col gap-1 rounded-xl p-1">
        <ChannelTab
          isActive={activeChannel === undefined}
          onSelect={() => onSelect(undefined)}
        >
          {t("templateStore.store.allChannels")}
        </ChannelTab>
        {channels.map((channel) => {
          const Icon = getChannelIcon(channel)
          return (
            <ChannelTab
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
    </fieldset>
  )
}

function ChannelTab({
  isActive,
  onSelect,
  children,
}: {
  isActive: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      aria-pressed={isActive}
      className={cn(
        TAB_CLASS_NAME,
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
