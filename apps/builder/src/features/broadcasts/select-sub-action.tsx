"use client"

import type { BroadcastSubaction, InboxType } from "@aha.chat/database/types"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import {
  SiMessenger,
  SiMessengerHex,
  SiWhatsapp,
  SiWhatsappHex,
} from "@icons-pack/react-simple-icons"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

type SelectSubActionProps = {
  inboxType: InboxType
  onSelectSubAction: (subaction: BroadcastSubaction) => void
}

export const SelectSubAction = (props: SelectSubActionProps) => {
  const t = useTranslations()
  const subActions = useMemo(() => {
    switch (props.inboxType) {
      case "whatsapp":
        return [
          {
            subAction: "templateMessage" as BroadcastSubaction,
            icon: <SiWhatsapp fill={SiWhatsappHex} title="WhatsApp" />,
            title: t("template_message"),
            description: t("template_message_description"),
          },
          {
            subAction: "recentContacts" as BroadcastSubaction,
            icon: <SiWhatsapp fill={SiWhatsappHex} title="WhatsApp" />,
            title: t("active_contacts_within_24_hours"),
            description: t("active_contacts_within_24_hours_description"),
          },
        ]
      case "messenger":
        return [
          {
            subAction: "OTN" as BroadcastSubaction,
            icon: <SiMessenger fill={SiMessengerHex} title="Messenger" />,
            title: t("otn_message"),
            description: t("otn_message_description"),
          },
          {
            subAction: "recentContacts" as BroadcastSubaction,
            icon: <SiMessenger fill={SiMessengerHex} title="Messenger" />,
            title: t("active_contacts_within_24_hours"),
            description: t("active_contacts_within_24_hours_description"),
          },
          {
            subAction: "allContacts" as BroadcastSubaction,
            icon: <SiMessenger fill={SiMessengerHex} title="Messenger" />,
            title: t("all_messages"),
            description: t("all_messages_description"),
          },
        ]
      default:
        return []
    }
  }, [props.inboxType, t])
  return (
    <div className="flex flex-col justify-center gap-4">
      {subActions.map((option) => (
        <Card
          className="cursor-pointer gap-0 hover:bg-gray-50"
          key={option.subAction}
          onClick={() => props.onSelectSubAction(option.subAction)}
        >
          <CardHeader className="text-xl">
            <CardTitle>
              <div className="mb-2 flex items-center gap-2">
                {option.icon}
                <div>{option.title}</div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-4">{option.description}</CardContent>
        </Card>
      ))}
    </div>
  )
}
