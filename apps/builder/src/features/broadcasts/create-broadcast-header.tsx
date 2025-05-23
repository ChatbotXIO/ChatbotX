import WhatsappIcon from "@/components/icons/whatsapp"
import { BroadcastSubaction, InboxType } from "@ahachat.ai/database/types"
import { AtomIcon } from "lucide-react"
import { useMemo, type ReactNode } from "react"

export function CreateBroadcastHeader(
  inboxType: InboxType | null,
  subaction: BroadcastSubaction,
): {
  icon: ReactNode
  title: string
  description: string
} {
  const header = useMemo(() => {
    if (inboxType === InboxType.WHATSAPP) {
      if (subaction === BroadcastSubaction.TEMPLATE_MESSAGE) {
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
