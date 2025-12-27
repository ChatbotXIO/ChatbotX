import { InboxType } from "@aha.chat/database/types"
import type { SelectOption } from "@aha.chat/ui/components/form/select-field"
import {
  SiMessenger,
  SiMessengerHex,
  SiWhatsapp,
  SiWhatsappHex,
  SiZalo,
  SiZaloHex,
} from "@icons-pack/react-simple-icons"
import { AppWindowIcon, AtomIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useInboxStore } from "./inbox-store-context"

export const allInboxConfigs = {
  omnichannel: {
    label: "Omnichannel",
    value: "omnichannel",
    icon: AtomIcon,
    iconColor: "none",
  },
  messenger: {
    label: "Messenger",
    value: InboxType.messenger,
    icon: SiMessenger,
    iconColor: SiMessengerHex,
  },
  whatsapp: {
    label: "Whatsapp",
    value: InboxType.whatsapp,
    icon: SiWhatsapp,
    iconColor: SiWhatsappHex,
  },
  zalo: {
    label: "Zalo",
    value: InboxType.zalo,
    icon: SiZalo,
    iconColor: SiZaloHex,
  },
  webchat: {
    label: "Webchat",
    value: InboxType.webchat,
    icon: AppWindowIcon,
    iconColor: "none",
  },
} as const

export const useConfiguredInboxTypeOptions: () => SelectOption[] = () => {
  const [inboxTypes, setInboxTypes] = useState<string[]>([])
  const inboxes = useInboxStore((state) => state.inboxes)

  useEffect(() => {
    const setOfInboxTypes = new Set<string>(["omnichannel"])
    for (const inbox of inboxes) {
      setOfInboxTypes.add(inbox.inboxType)
    }
    setInboxTypes(Array.from(setOfInboxTypes))
  }, [inboxes])

  return useMemo(
    () =>
      inboxTypes.map(
        (inboxType) =>
          allInboxConfigs[inboxType as keyof typeof allInboxConfigs],
      ),
    [inboxTypes],
  )
}
