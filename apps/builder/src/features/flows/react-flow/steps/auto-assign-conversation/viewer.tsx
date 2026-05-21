"use client"

import type { AutoAssignConversationStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { MessageCirclePlus } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

const AutoAssignConversationStepViewer = ({
  data,
}: {
  data: AutoAssignConversationStepSchema
}) => {
  const t = useTranslations()

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer
            icon={MessageCirclePlus}
            title={t("flows.actions.autoAssignConversation")}
          />
        </div>
        <div className="my-2 mr-3 flex flex-col gap-1">
          {data.states.map((state) => (
            <BaseStateViewer data={state} key={state.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default AutoAssignConversationStepViewer
