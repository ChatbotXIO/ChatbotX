"use client"

import type { WhatsappLocationStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { LocationPreview } from "./location-preview"

type WhatsappLocationStepViewerProps = {
  data: WhatsappLocationStepSchema
}

const WhatsappLocationStepViewer = (props: WhatsappLocationStepViewerProps) => {
  const { data } = props
  const t = useTranslations()

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <LocationPreview
          address={data.address}
          fallbackTitle={t("flows.whatsappLocation.setLocation")}
          latitude={data.latitude}
          longitude={data.longitude}
          name={data.name}
        />
      </CardContent>
    </Card>
  )
}

export default WhatsappLocationStepViewer
