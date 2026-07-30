"use client"

import type { SendGridAddContactSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

export default function SendGridAddContactViewer(props: {
  data: SendGridAddContactSchema
}) {
  const t = useTranslations()
  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer
            icon={MailIcon}
            title={t("flows.actions.sendGridAddContact")}
          />
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
