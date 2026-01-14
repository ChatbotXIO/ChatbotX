import { InboxType } from "@aha.chat/database/types"
import { cn } from "@aha.chat/ui/lib/utils"
import {
  SiMessenger,
  SiMessengerHex,
  SiWhatsapp,
  SiWhatsappHex,
  SiZalo,
  SiZaloHex,
} from "@icons-pack/react-simple-icons"
import { AppWindowIcon, GlobeIcon } from "lucide-react"
import { memo } from "react"

type InboxIconProps = {
  inboxType: InboxType | "omnichannel"
  wrapperClassName?: string
  iconClassName?: string
  label?: string
  labelClassName?: string
  showLabel?: boolean
}

export const InboxIcon = memo(
  ({
    inboxType,
    wrapperClassName,
    iconClassName,
    label,
    labelClassName,
    showLabel = true,
  }: InboxIconProps) => {
    const defaultWrapperClassName = "flex items-center gap-1"
    const defaultIconClassName = "size-4"
    const defaultLabelClassName = "text-sm truncate"

    switch (inboxType) {
      case InboxType.messenger:
        return (
          <div className={cn(defaultWrapperClassName, wrapperClassName)}>
            <SiMessenger
              className={cn(defaultIconClassName, iconClassName)}
              fill={SiMessengerHex}
            />
            {showLabel && (
              <span className={cn(defaultLabelClassName, labelClassName)}>
                {label ?? "Messenger"}
              </span>
            )}
          </div>
        )
      case InboxType.whatsapp:
        return (
          <div className={cn(defaultWrapperClassName, wrapperClassName)}>
            <SiWhatsapp
              className={cn(defaultIconClassName, iconClassName)}
              fill={SiWhatsappHex}
            />
            {showLabel && (
              <span className={cn(defaultLabelClassName, labelClassName)}>
                {label ?? "Whatsapp"}
              </span>
            )}
          </div>
        )
      case InboxType.zalo:
        return (
          <div className={cn(defaultWrapperClassName, wrapperClassName)}>
            <SiZalo
              className={cn(defaultIconClassName, iconClassName)}
              fill={SiZaloHex}
            />
            {showLabel && (
              <span className={cn(defaultLabelClassName, labelClassName)}>
                {label ?? "Zalo"}
              </span>
            )}
          </div>
        )
      case InboxType.webchat:
        return (
          <div className={cn(defaultWrapperClassName, wrapperClassName)}>
            <AppWindowIcon
              className={cn(
                defaultIconClassName,
                iconClassName,
                "fill-zinc-100 dark:stroke-zinc-800",
              )}
            />
            {showLabel && (
              <span className={cn(defaultLabelClassName, labelClassName)}>
                {label ?? "Webchat"}
              </span>
            )}
          </div>
        )
      default:
        return (
          <div className={cn(defaultWrapperClassName, wrapperClassName)}>
            <GlobeIcon className={cn(defaultIconClassName, iconClassName)} />
            {showLabel && (
              <span className={cn(defaultLabelClassName, labelClassName)}>
                {label ?? "Omnichannel"}
              </span>
            )}
          </div>
        )
    }
  },
)
