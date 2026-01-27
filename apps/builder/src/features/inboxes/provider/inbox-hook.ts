import { InboxType } from "@aha.chat/database/types"
import type { SelectOption } from "@aha.chat/ui/components/form/select-field"
import { useEffect, useMemo, useState } from "react"
import { useInboxStore } from "./inbox-store-context"

export const allInboxConfigs = {
  omnichannel: {
    label: "Omnichannel",
    value: "omnichannel",
  },
  messenger: {
    label: "Messenger",
    value: InboxType.messenger,
  },
  whatsapp: {
    label: "Whatsapp",
    value: InboxType.whatsapp,
  },
  zalo: {
    label: "Zalo",
    value: InboxType.zalo,
  },
  webchat: {
    label: "Webchat",
    value: InboxType.webchat,
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
