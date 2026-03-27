import { channelType } from "@aha.chat/database/types"
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
    value: "messenger",
  },
  whatsapp: {
    label: "Whatsapp",
    value: "whatsapp",
  },
  zalo: {
    label: "Zalo OA",
    value: "zalo",
  },
  webchat: {
    label: "Webchat",
    value: "webchat",
  },
} as const

export const useConfiguredInboxTypeOptions = () => {
  const [inboxTypes, setInboxTypes] = useState<string[]>([])
  const inboxes = useInboxStore((state) => state.inboxes)

  useEffect(() => {
    const setOfInboxTypes = new Set<string>(["omnichannel"])
    for (const inbox of inboxes) {
      setOfInboxTypes.add(inbox.channel)
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

export const useWhatsappInboxOptions = (): SelectOption[] => {
  const inboxes = useInboxStore((state) => state.inboxes)

  return useMemo(
    () =>
      inboxes
        .filter((inbox) => inbox.channel === channelType.whatsapp)
        .map((inbox) => ({
          label: inbox.name,
          value: inbox.integrationWhatsapp?.id ?? inbox.id,
        })),
    [inboxes],
  )
}
