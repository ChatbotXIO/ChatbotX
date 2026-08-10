"use client"

import {
  CHANNEL_CAPABILITIES,
  type ChannelType,
  CREATABLE_CHANNELS,
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
import { memo, useCallback } from "react"
import { InboxIcon } from "./inbox-icon"

type InboxSelectCardProps = {
  configuredChannels: ChannelType[]
  /**
   * Channels offered on this picker, already filtered to what the caller's
   * platform admin / white-label owner allows. Defaults to every creatable
   * channel so callers that haven't been wired up to channel-visibility yet
   * keep today's behavior unchanged.
   */
  offeredChannels?: ChannelType[]
}

function InboxSelectCard({
  configuredChannels,
  offeredChannels = CREATABLE_CHANNELS,
}: InboxSelectCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()

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
          {offeredChannels.map((channel) => (
            <li className="flex items-center gap-2" key={channel}>
              <div className="min-w-0 flex-1">
                <InboxIcon channel={channel} size="large" />
              </div>
              <Button
                disabled={
                  CHANNEL_CAPABILITIES[channel].requiresCredential &&
                  !configuredChannels.includes(channel)
                }
                onClick={() => handleInboxSelect(channel)}
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
