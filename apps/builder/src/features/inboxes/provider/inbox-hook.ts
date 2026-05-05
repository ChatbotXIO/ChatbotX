import { channelTypes } from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
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
  instagram: {
    label: "Instagram",
    value: "instagram",
  },
  whatsapp: {
    label: "Whatsapp",
    value: "whatsapp",
  },
  zalo: {
    label: "Zalo OA",
    value: "zalo",
  },
  telegram: {
    label: "Telegram",
    value: "telegram",
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
        .filter((inbox) => inbox.channel === channelTypes.enum.whatsapp)
        .map((inbox) => ({
          label: inbox.name,
          value: inbox.id,
        })),
    [inboxes],
  )
}

export const useSmtpInboxOptions = (): SelectOption[] => {
  const inboxes = useInboxStore((state) => state.inboxes)

  return useMemo(
    () =>
      inboxes
        .filter((inbox) => inbox.channel === channelTypes.enum.smtp)
        .map((inbox) => ({
          label: inbox.name,
          value: inbox.integrationSmtp?.id ?? "",
        })),
    [inboxes],
  )
}
