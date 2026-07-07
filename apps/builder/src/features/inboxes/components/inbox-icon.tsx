import type { ChannelType } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  SiInstagram,
  SiInstagramHex,
  SiMessenger,
  SiMessengerHex,
  SiTelegram,
  SiTelegramHex,
  SiTiktok,
  SiTiktokHex,
  SiWhatsapp,
  SiWhatsappHex,
  SiZalo,
  SiZaloHex,
} from "@icons-pack/react-simple-icons"
import {
  AppWindowIcon,
  GlobeIcon,
  type LucideIcon,
  MailIcon,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"
import { memo } from "react"

type IconSize = "small" | "medium" | "large" | "xlarge"

const ICON_SIZE_CLASSES: Record<IconSize, string> = {
  small: "size-4",
  medium: "size-5",
  large: "size-6",
  xlarge: "size-10",
}

const LABEL_SIZE_CLASSES: Record<IconSize, string> = {
  small: "text-xs truncate min-w-0",
  medium: "text-sm truncate min-w-0",
  large: "text-base truncate min-w-0",
  xlarge: "text-base truncate min-w-0",
}

type InboxIconConfig = {
  Icon: ComponentType<SVGProps<SVGSVGElement> & { fill?: string }> | LucideIcon
  fill?: string
  iconClassName?: string
  defaultLabel: string
}

export const INBOX_ICON_CONFIG: Record<ChannelType, InboxIconConfig> = {
  messenger: {
    Icon: SiMessenger,
    fill: SiMessengerHex,
    defaultLabel: "Messenger",
  },
  instagram: {
    Icon: SiInstagram,
    fill: SiInstagramHex,
    defaultLabel: "Instagram",
  },
  whatsapp: {
    Icon: SiWhatsapp,
    fill: SiWhatsappHex,
    defaultLabel: "Whatsapp",
  },
  zalo: {
    Icon: SiZalo,
    fill: SiZaloHex,
    defaultLabel: "Zalo OA",
  },
  telegram: {
    Icon: SiTelegram,
    fill: SiTelegramHex,
    defaultLabel: "Telegram",
  },
  tiktok: {
    Icon: SiTiktok,
    fill: SiTiktokHex,
    defaultLabel: "TikTok",
    iconClassName:
      "[paint-order:stroke_fill] stroke-2 stroke-white dark:fill-zinc-100 dark:stroke-zinc-900",
  },
  webchat: {
    Icon: AppWindowIcon,
    iconClassName: "fill-zinc-100 dark:stroke-zinc-800",
    defaultLabel: "Webchat",
  },
  smtp: {
    Icon: MailIcon,
    defaultLabel: "Email",
  },
  omnichannel: {
    Icon: GlobeIcon,
    defaultLabel: "Omnichannel",
  },
}

type InboxIconProps = {
  channel: ChannelType
  wrapperClassName?: string
  iconClassName?: string
  label?: string
  labelClassName?: string
  showLabel?: boolean
  size?: IconSize
}

const isChannelType = (channel: string): channel is ChannelType =>
  channel in INBOX_ICON_CONFIG

export const InboxIcon = memo(
  ({
    channel,
    wrapperClassName,
    iconClassName,
    label,
    labelClassName,
    showLabel = true,
    size = "medium",
  }: InboxIconProps) => {
    const config = isChannelType(channel)
      ? INBOX_ICON_CONFIG[channel]
      : INBOX_ICON_CONFIG.omnichannel
    const {
      Icon,
      fill,
      iconClassName: configIconClassName,
      defaultLabel,
    } = config

    return (
      <div className={cn("flex min-w-0 items-center gap-2", wrapperClassName)}>
        <Icon
          className={cn(
            ICON_SIZE_CLASSES[size],
            configIconClassName,
            iconClassName,
          )}
          {...(fill !== undefined && { fill })}
        />
        {showLabel && (
          <span
            className={cn("flex-1", LABEL_SIZE_CLASSES[size], labelClassName)}
          >
            {label ?? defaultLabel}
          </span>
        )}
      </div>
    )
  },
)
InboxIcon.displayName = "InboxIcon"
