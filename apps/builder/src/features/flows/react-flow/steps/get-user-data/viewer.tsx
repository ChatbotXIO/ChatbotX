"use client"

import {
  type GetUserDataStepSchema,
  ReplyFormat,
  stateTypes,
} from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"

const WEBVIEW_REPLY_FORMATS = new Set<string>([
  ReplyFormat.date,
  ReplyFormat.datetime,
])

const GetUserDataStepViewer = ({ data }: { data: GetUserDataStepSchema }) => {
  const t = useTranslations()

  const getStateLabel = (stateType: string) => {
    if (stateType === stateTypes.skip) {
      return data.skipButtonLabel
    }
    if (
      stateType === stateTypes.success &&
      WEBVIEW_REPLY_FORMATS.has(data.replyFormat)
    ) {
      return t("flows.dataWasSaved")
    }
    return
  }

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p className="bg-gray-200 px-4 py-2 dark:bg-neutral-600">
          {data.message}
        </p>
        {/* React Flow keeps each state's connector on physical Position.Right. */}
        <div className="my-2 mr-3 flex flex-col gap-1">
          {data.states.map((state) => (
            <BaseStateViewer
              data={state}
              key={state.id}
              label={getStateLabel(state.stateType)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default GetUserDataStepViewer
