"use client"

import type { SendMetaCapiEventSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { MegaphoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { getMetaCapiEventSummaryLines } from "@/features/meta-conversions/lib/event-summary"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

export default function SendMetaCapiEventViewer(props: {
  data: SendMetaCapiEventSchema
}) {
  const t = useTranslations()
  const summaryLines = getMetaCapiEventSummaryLines(props.data, t)
  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer
            icon={MegaphoneIcon}
            title={t("flows.actions.sendMetaCapiEvent")}
          />
          {summaryLines.length > 0 ? (
            <div className="mt-1 flex flex-col gap-0.5 text-muted-foreground text-xs">
              {summaryLines.map((line) => (
                <span className="truncate" key={line}>
                  {line}
                </span>
              ))}
            </div>
          ) : null}
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
