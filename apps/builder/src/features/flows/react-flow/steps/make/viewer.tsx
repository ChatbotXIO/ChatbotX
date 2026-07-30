"use client"

import type { MakeStepSchema } from "@chatbotx.io/flow-config"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { WebhookIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

const MakeStepViewer = ({ data }: { data: MakeStepSchema }) => {
  const t = useTranslations()

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-2 px-4 py-2">
          <BaseStepViewer icon={WebhookIcon} title={t("flows.actions.make")} />
          <div className="flex flex-wrap gap-1">
            {data.events.map((event) => (
              <Badge key={event} variant="secondary">
                {event}
              </Badge>
            ))}
          </div>
        </div>
        {/* React Flow keeps each state's connector on physical Position.Right. */}
        <div className="my-2 mr-3 flex flex-col gap-1">
          {data.states.map((state) => (
            <BaseStateViewer data={state} key={state.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default MakeStepViewer
