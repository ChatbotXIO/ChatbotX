"use client"

import { InboxType } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import {
  SiMessenger,
  SiMessengerHex,
  SiWhatsapp,
  SiWhatsappHex,
  SiZalo,
  SiZaloHex,
} from "@icons-pack/react-simple-icons"
import { AppWindowIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useMemo } from "react"

type InboxOption = {
  title: string
  icon: React.ComponentType<{ className?: string; fill?: string }>
  iconColor: string
  value: InboxType
}

// Memoize inbox configuration to prevent recreation on every render
const createInboxOptions = (t: (key: string) => string): InboxOption[] => [
  {
    title: t("whatsapp.title"),
    icon: SiWhatsapp,
    iconColor: SiWhatsappHex,
    value: InboxType.WHATSAPP,
  },
  {
    title: t("messenger.title"),
    icon: SiMessenger,
    iconColor: SiMessengerHex,
    value: InboxType.MESSENGER,
  },
  {
    title: t("zalo.title"),
    icon: SiZalo,
    iconColor: SiZaloHex,
    value: InboxType.ZALO,
  },
  {
    title: t("webchat.title"),
    icon: AppWindowIcon,
    iconColor: "none",
    value: InboxType.WEBCHAT,
  },
]

function InboxSelectCard() {
  const t = useTranslations()
  const router = useRouter()

  // Memoize inbox options to prevent recreation on every render
  const inboxOptions = useMemo(() => createInboxOptions(t), [t])

  // Memoize navigation handler to prevent recreation on every render
  const handleInboxSelect = useCallback(
    (inboxType: InboxType) => {
      router.push(`/channels/create?channel=${inboxType.toLowerCase()}`)
    },
    [router],
  )

  return (
    <Card className="mx-auto mt-40 max-w-md">
      <CardHeader>
        <CardTitle className="font-bold text-2xl">
          {t("actions.createFeature", { feature: t("fields.chatbot.label") })}
        </CardTitle>
        <CardDescription />
      </CardHeader>
      <CardContent>
        <ul aria-label="Available inbox types" className="flex flex-col gap-4">
          {inboxOptions.map((inbox) => (
            <li className="flex items-center gap-2" key={inbox.value}>
              <div className="flex flex-1 items-center gap-2">
                <inbox.icon
                  aria-hidden="true"
                  className="size-6"
                  fill={inbox.iconColor}
                />
                <span>{inbox.title}</span>
              </div>
              <Button
                aria-label={`Continue with ${inbox.title}`}
                onClick={() => handleInboxSelect(inbox.value)}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t("actions.continue")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export default memo(InboxSelectCard)
