import { InboxType, Omnichannel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { SiMessenger, SiWhatsapp, SiZalo } from "@icons-pack/react-simple-icons"
import { AtomIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type InboxTypeSelectProps = {
  inboxTypes: string[]
  onSelectInboxType: (inboxType: InboxType | null) => void
}

export const InboxTypeSelect = (props: InboxTypeSelectProps) => {
  const t = useTranslations()

  const allTypes = [
    {
      icon: AtomIcon,
      name: t("omnichannel.title"),
      value: Omnichannel,
      description:
        "Send a flow to all contacts. You can send messages or executes actions.",
    },
    {
      icon: SiMessenger,
      name: t("messenger.title"),
      value: InboxType.Messenger,
      description: "",
    },
    {
      icon: SiWhatsapp,
      name: t("whatsapp.title"),
      value: InboxType.Whatsapp,
      description: "",
    },
    {
      icon: SiZalo,
      name: t("zalo.title"),
      value: InboxType.Zalo,
      description: "",
    },
  ]

  const validTypes: typeof allTypes = []
  for (const tt of allTypes) {
    if (props.inboxTypes.includes(tt.value ?? "")) {
      validTypes.push(tt)
    }
  }

  return (
    <>
      {validTypes.map((tt) => (
        <div className="flex w-full items-center gap-2" key={tt.value}>
          <span className="flex flex-1 gap-2">
            <tt.icon />
            {tt.name}
          </span>
          <Button
            onClick={() => props.onSelectInboxType(tt.value as InboxType)}
            variant="secondary"
          >
            {t("actions.continue")}
          </Button>
        </div>
      ))}
    </>
  )
}
