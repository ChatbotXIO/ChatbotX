import type { MessengerTag } from "@aha.chat/database"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { SiMessenger, SiMessengerHex } from "@icons-pack/react-simple-icons"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

type SelectMessengerTagProps = {
  onSelectTag: (tag: MessengerTag) => void
}

export const SelectMessengerTags = (props: SelectMessengerTagProps) => {
  const t = useTranslations()
  const messengerTags = useMemo(
    () => [
      {
        tag: "ACCOUNT_UPDATE" as MessengerTag,
        icon: <SiMessenger fill={SiMessengerHex} title="Messenger" />,
        title: t("account_update"),
        description: t("account_update_description"),
      },
      {
        tag: "CONFIRMED_EVENT_UPDATE" as MessengerTag,
        icon: <SiMessenger fill={SiMessengerHex} title="Messenger" />,
        title: t("confirmed_event_update"),
        description: t("confirmed_event_update_description"),
      },
      {
        tag: "POST_PURCHASE_UPDATE" as MessengerTag,
        icon: <SiMessenger fill={SiMessengerHex} title="Messenger" />,
        title: t("post_purchase_update"),
        description: t("post_purchase_update_description"),
      },
    ],
    [t],
  )
  return (
    <div className="flex flex-col justify-center gap-4">
      {messengerTags.map((option) => (
        <Card
          className="cursor-pointer gap-0 hover:bg-gray-50"
          key={option.tag}
          onClick={() => props.onSelectTag(option.tag)}
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
