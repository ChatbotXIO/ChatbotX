import { InboxType } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { AtomIcon } from "lucide-react"
import { MessengerIcon } from "@/components/icons/messenger"
import WhatsappIcon from "@/components/icons/whatsapp"

type InboxTypeSelectProps = {
  inboxTypes: string[]
  onSelectInboxType: (inboxType: InboxType | null) => void
}

export const InboxTypeSelect = (props: InboxTypeSelectProps) => {
  const allTypes = [
    {
      icon: <AtomIcon />,
      name: "Omnichannel",
      value: InboxType.OMNICHANNEL,
      description:
        "Send a flow to all contacts. You can send messages or executes actions.",
    },
    {
      icon: <MessengerIcon />,
      name: "Messenger",
      value: InboxType.MESSENGER,
      description: "",
    },
    {
      icon: <WhatsappIcon />,
      name: "Whatsapp",
      value: InboxType.WHATSAPP,
      description: "",
    },
  ]

  const validTypes: typeof allTypes = []
  for (const t of allTypes) {
    if (props.inboxTypes.includes(t.value ?? "")) {
      validTypes.push(t)
    }
  }

  return (
    <>
      {validTypes.map((t) => (
        <div className="flex w-full items-center gap-2" key={t.value}>
          <span className="flex flex-1 gap-2">
            {t.icon}
            {t.name}
          </span>
          <Button
            onClick={() => props.onSelectInboxType(t.value)}
            variant="secondary"
          >
            Continue
          </Button>
        </div>
      ))}
    </>
  )
}
