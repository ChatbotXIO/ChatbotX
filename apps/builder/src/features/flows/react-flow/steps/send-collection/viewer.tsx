"use client"

import type { SendCollectionStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { GalleryHorizontalIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { CollectionSummary } from "./components/collection-summary"

const SendCollectionStepViewer = ({
  data,
}: {
  data: SendCollectionStepSchema
}) => {
  const t = useTranslations()
  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="flex flex-col items-center gap-0.5 bg-gray-100 px-4 py-3 text-center dark:bg-neutral-700">
        <span className="flex items-center gap-1.5 font-medium text-sm">
          <GalleryHorizontalIcon
            aria-hidden
            className="size-4 text-amber-500"
          />
          {t("flows.actions.sendCollection")}
        </span>
        <span className="text-muted-foreground text-xs">
          <CollectionSummary step={data} />
        </span>
      </CardContent>
    </Card>
  )
}

export default SendCollectionStepViewer
