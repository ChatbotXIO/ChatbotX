import { BroadcastSubaction, InboxType } from "@aha.chat/database/types"
import { SiWhatsapp, SiWhatsappHex } from "@icons-pack/react-simple-icons"
import { AtomIcon } from "lucide-react"
import { type ReactNode, useMemo } from "react"

export function CreateBroadcastHeader(
  inboxType: InboxType | null,
  subaction: BroadcastSubaction,
): {
  icon: ReactNode
  title: string
  description: string
} {
  const header = useMemo(() => {
    if (inboxType === InboxType.whatsapp) {
      if (subaction === BroadcastSubaction.templateMessage) {
        return {
          icon: <SiWhatsapp fill={SiWhatsappHex} />,
          title: "Template message",
          description: "Send WhatsApp template message to your contacts",
        }
      }

      return {
        icon: <SiWhatsapp fill={SiWhatsappHex} />,
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
