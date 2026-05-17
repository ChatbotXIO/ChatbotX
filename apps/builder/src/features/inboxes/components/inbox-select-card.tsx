"use client"

import type {
  ChannelType,
  InstagramCredentialPublic,
  MessengerCredentialPublic,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, type ReactNode, useCallback, useMemo } from "react"
import { InstagramConnect } from "@/features/integration-instagram/components/instagram-connect"
import { MessengerConnect } from "@/features/integration-messenger/components/messenger-connect"
import { InboxIcon } from "./inbox-icon"

type InboxSelectCardProps = {
  messengerPublicConfig: MessengerCredentialPublic | null
  instagramPublicConfig: InstagramCredentialPublic | null
  configuredChannels: ChannelType[]
}

function InboxSelectCard({
  messengerPublicConfig,
  instagramPublicConfig,
  configuredChannels,
}: InboxSelectCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()

  const connectMessengerTrigger = useMemo(() => {
    if (messengerPublicConfig) {
      return (
        <MessengerConnect
          publicConfig={messengerPublicConfig}
          trigger={t("actions.continue")}
        />
      )
    }

    return (
      <Button disabled type="button" variant="secondary">
        {t("actions.continue")}
      </Button>
    )
  }, [messengerPublicConfig, t])

  const connectInstagramTrigger = useMemo(() => {
    if (instagramPublicConfig) {
      return (
        <InstagramConnect
          publicConfig={instagramPublicConfig}
          trigger={t("actions.continue")}
        />
      )
    }

    return (
      <Button disabled type="button" variant="secondary">
        {t("actions.continue")}
      </Button>
    )
  }, [instagramPublicConfig, t])

  const inboxOptions: { value: ChannelType; trigger?: ReactNode }[] = useMemo(
    () => [
      {
        value: "whatsapp",
      },
      {
        value: "messenger",
        trigger: connectMessengerTrigger,
      },
      {
        value: "instagram",
        trigger: connectInstagramTrigger,
      },
      {
        value: "zalo",
      },
      {
        value: "telegram",
      },
      {
        value: "webchat",
      },
    ],
    [connectMessengerTrigger, connectInstagramTrigger],
  )

  const handleInboxSelect = useCallback(
    (channel: ChannelType) => {
      router.push(
        `/channels/create?${searchParams.toString()}&channel=${channel}`,
      )
    },
    [router, searchParams],
  )

  return (
    <Card className="mx-auto mt-40 max-w-md">
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("actions.createFeature", { feature: t("fields.workspace.label") })}
        </CardTitle>
        <CardDescription />
      </CardHeader>
      <CardContent>
        <ul aria-label="Available inbox types" className="flex flex-col gap-4">
          {inboxOptions.map((inbox) => (
            <li className="flex items-center gap-2" key={inbox.value}>
              <div className="flex-1">
                <InboxIcon channel={inbox.value} size="large" />
              </div>
              {inbox.trigger ?? (
                <Button
                  disabled={
                    inbox.value !== "webchat" &&
                    inbox.value !== "telegram" &&
                    !configuredChannels.includes(inbox.value)
                  }
                  onClick={() => handleInboxSelect(inbox.value)}
                  type="button"
                  variant="secondary"
                >
                  {t("actions.continue")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export default memo(InboxSelectCard)
