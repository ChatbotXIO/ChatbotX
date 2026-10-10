"use client"

import type { SendGoogleAdsConversionSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { MegaphoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { getGoogleAdsConversionSummaryLines } from "@/features/integration-google-ads/lib/conversion-summary"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

export default function SendGoogleAdsConversionViewer(props: {
  data: SendGoogleAdsConversionSchema
}) {
  const t = useTranslations()
  const summaryLines = getGoogleAdsConversionSummaryLines(props.data, t)
  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer
            icon={MegaphoneIcon}
            title={t("flows.actions.sendGoogleAdsConversion")}
          />
          <div className="mt-1 flex flex-col gap-0.5 text-muted-foreground text-xs">
            {summaryLines.map((line) => (
              <span className="truncate" key={line}>
                {line}
              </span>
            ))}
          </div>
        </div>
        {/* React Flow keeps each state's connector on physical Position.Right. */}
        <div className="my-2 mr-3 flex flex-col gap-1">
          {props.data.states.map((state) => (
            <BaseStateViewer data={state} key={state.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
