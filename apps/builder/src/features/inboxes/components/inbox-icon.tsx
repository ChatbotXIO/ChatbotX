import type { ChannelType } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  SiMessenger,
  SiMessengerHex,
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

type IconSize = "small" | "medium" | "large"

const ICON_SIZE_CLASSES: Record<IconSize, string> = {
  small: "size-4",
  medium: "size-5",
  large: "size-6",
}

const LABEL_SIZE_CLASSES: Record<IconSize, string> = {
  small: "text-xs truncate",
  medium: "text-sm truncate",
  large: "text-base truncate",
}

type InboxIconConfig = {
  Icon: ComponentType<SVGProps<SVGSVGElement> & { fill?: string }> | LucideIcon
  fill?: string
  iconClassName?: string
  defaultLabel: string
}

const INBOX_ICON_CONFIG: Record<ChannelType, InboxIconConfig> = {
  messenger: {
    Icon: SiMessenger,
    fill: SiMessengerHex,
    defaultLabel: "Messenger",
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
  webchat: {
    Icon: AppWindowIcon,
    iconClassName: "fill-zinc-100 dark:stroke-zinc-800",
    defaultLabel: "Webchat",
  },
  smtp: {
    Icon: MailIcon,
    iconClassName: "fill-zinc-100 dark:stroke-zinc-800",
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
      <div className={cn("flex items-center gap-2", wrapperClassName)}>
        <Icon
          className={cn(
            ICON_SIZE_CLASSES[size],
            configIconClassName,
            iconClassName,
          )}
          fill={fill}
        />
        {showLabel && (
          <span className={cn(LABEL_SIZE_CLASSES[size], labelClassName)}>
            {label ?? defaultLabel}
          </span>
        )}
      </div>
    )
  },
)
InboxIcon.displayName = "InboxIcon"
