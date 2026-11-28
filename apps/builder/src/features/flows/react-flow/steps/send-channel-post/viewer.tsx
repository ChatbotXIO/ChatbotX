"use client"

import type { SendChannelPostStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { NewspaperIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { ChannelPostSummary } from "./components/channel-post-summary"

type SendChannelPostStepViewerProps = {
  data: SendChannelPostStepSchema
}

const SendChannelPostStepViewer = ({
  data,
}: SendChannelPostStepViewerProps) => {
  const t = useTranslations()

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="flex flex-col gap-1.5 bg-gray-100 px-4 py-3 dark:bg-neutral-700">
        <span className="flex items-center gap-1.5 font-medium text-sm">
          <NewspaperIcon aria-hidden className="size-4 text-pink-500" />
          {t("flows.actions.sendChannelPost")}
        </span>
        <ChannelPostSummary channelPostId={data.channelPostId} />
      </CardContent>
    </Card>
  )
}

export default SendChannelPostStepViewer
