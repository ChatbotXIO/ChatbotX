import type { TemplateChannel } from "@chatbotx.io/database/partials"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import {
  getChannelIcon,
  INBOX_ICON_CONFIG,
} from "@/features/inboxes/components/inbox-icon"
import { coversEveryTemplateChannel } from "../lib/filter-store-templates"

/** The pill around the "every channel" globe and label, defined once for every place it shows. */
const ALL_CHANNELS_PILL_CLASS_NAME =
  "inline-flex h-5 items-center rounded-md bg-background px-1.5 font-medium text-[11px] text-muted-foreground leading-none"
/** The "every channel" globe's colour. */
const ALL_CHANNELS_GLOBE_CLASS_NAME = "text-muted-foreground"

/**
 * One icon, named for screen readers (`aria-label`) and on hover (tooltip). The
 * svg ignores the pointer so its own `<title>` never shows a second tooltip.
 */
function NamedIcon({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={label}
            className="flex [&_svg]:pointer-events-none"
            role="img"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The brand icons of the channels a template supports, one per channel, in the
 * order given. A template that works on every channel (names none, or all of
 * them) renders nothing, or (`showGlobeWhenEvery`) the globe and a visible "All
 * channels" label instead of a long row of icons.
 */
export function TemplateChannelIcons({
  channels,
  iconClassName = "size-5",
  className,
  showGlobeWhenEvery = false,
}: {
  channels: readonly TemplateChannel[]
  iconClassName?: string
  className?: string
  showGlobeWhenEvery?: boolean
}) {
  const t = useTranslations()
  if (coversEveryTemplateChannel(channels)) {
    if (!showGlobeWhenEvery) {
      return null
    }
    const Globe = getChannelIcon("omnichannel")
    return (
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        <span aria-hidden="true" className="flex">
          <Globe className={cn(iconClassName, ALL_CHANNELS_GLOBE_CLASS_NAME)} />
        </span>
        <span className={ALL_CHANNELS_PILL_CLASS_NAME}>
          <bdi>{t("templateStore.store.allChannels")}</bdi>
        </span>
      </div>
    )
  }
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)}>
      {channels.map((channel) => {
        const Icon = getChannelIcon(channel)
        return (
          <li key={channel}>
            <NamedIcon label={t(INBOX_ICON_CONFIG[channel].defaultLabelKey)}>
              <Icon className={iconClassName} />
            </NamedIcon>
          </li>
        )
      })}
    </ul>
  )
}
