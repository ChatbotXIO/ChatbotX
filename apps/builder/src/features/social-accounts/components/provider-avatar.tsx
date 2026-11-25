import type { SocialProvider } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  SiFacebook,
  SiFacebookHex,
  SiInstagram,
  SiInstagramHex,
  SiThreads,
  SiTiktok,
} from "@icons-pack/react-simple-icons"
import type { ComponentType, SVGProps } from "react"

type ProviderIconConfig = {
  Icon: ComponentType<SVGProps<SVGSVGElement> & { fill?: string }>
  className?: string
  fill?: string
}

/** The brand mark of each publishing network, shown while a destination has no picture. */
export const PROVIDER_ICON_CONFIG: Record<SocialProvider, ProviderIconConfig> =
  {
    facebook: { Icon: SiFacebook, fill: SiFacebookHex },
    instagram: { Icon: SiInstagram, fill: SiInstagramHex },
    // The brand colours of Threads and TikTok are black: the class lets dark mode render them light.
    threads: { Icon: SiThreads, className: "fill-zinc-900 dark:fill-zinc-100" },
    tiktok: { Icon: SiTiktok, className: "fill-zinc-900 dark:fill-zinc-100" },
  }

type ProviderNetworkIconProps = {
  className?: string
  provider: SocialProvider
} & (
  | {
      /** The network's name, read by screen readers and shown as a tooltip. */
      label: string
      decorative?: never
    }
  | {
      /** Next to the network's visible name: hidden from screen readers. */
      decorative: true
      label?: never
    }
)

/** The network's brand mark alone, with its name for screen readers and as a tooltip. */
export const ProviderNetworkIcon = ({
  className,
  decorative,
  label,
  provider,
}: ProviderNetworkIconProps) => {
  const {
    Icon,
    className: iconClassName,
    fill,
  } = PROVIDER_ICON_CONFIG[provider]
  const a11y = decorative
    ? { "aria-hidden": true }
    : { "aria-label": label, role: "img", title: label }
  return (
    <span className="inline-flex shrink-0" {...a11y}>
      <Icon
        aria-hidden="true"
        className={cn("size-3.5", iconClassName, className)}
        {...(fill !== undefined && !iconClassName && { fill })}
      />
    </span>
  )
}

/**
 * A destination's picture, or the brand icon of its network when there is none
 * (or the image fails to load). Never a generic person icon.
 */
export const ProviderAvatar = ({
  avatar,
  className,
  provider,
}: {
  avatar: string | null
  className?: string
  provider: SocialProvider
}) => {
  const {
    Icon,
    className: iconClassName,
    fill,
  } = PROVIDER_ICON_CONFIG[provider]
  return (
    <Avatar aria-hidden="true" className={cn("shrink-0", className)}>
      {avatar ? <AvatarImage alt="" src={avatar} /> : null}
      <AvatarFallback className="bg-muted">
        <Icon
          className={cn("size-1/2", iconClassName)}
          {...(fill !== undefined && !iconClassName && { fill })}
        />
      </AvatarFallback>
    </Avatar>
  )
}
