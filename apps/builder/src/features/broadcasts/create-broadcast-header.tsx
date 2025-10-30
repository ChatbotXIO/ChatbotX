import { BroadcastSubaction, InboxType } from "@aha.chat/database/types"
import { AtomIcon } from "lucide-react"
import { type ReactNode, useMemo } from "react"
import WhatsappIcon from "@/components/icons/whatsapp"

export function CreateBroadcastHeader(
  inboxType: InboxType | null,
  subaction: BroadcastSubaction,
): {
  icon: ReactNode
  title: string
  description: string
} {
  const header = useMemo(() => {
    if (inboxType === InboxType.Whatsapp) {
      if (subaction === BroadcastSubaction.templateMessage) {
        return {
          icon: <WhatsappIcon />,
          title: "Template message",
          description: "Send WhatsApp template message to your contacts",
        }
      }

      return {
        icon: <WhatsappIcon />,
        title: "Active contacts within 24 hours",
        description:
          "May contain promotions and will only be sent to users who messaged your bot within the last 24h.",
      }
    }

    return {
      icon: <AtomIcon />,
      title: "Omnichannel",
      description:
        "Send a flow to all contacts. You can send messages or executes actions.",
    }
  }, [inboxType, subaction])

  return header
}
