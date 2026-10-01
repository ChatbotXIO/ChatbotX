"use client"

import type { ThreadControlStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { ArrowRightLeftIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"
import { THREAD_CONTROL_STEP_ACTION_KEYS } from "./labels"

const ThreadControlStepViewer = ({
  data,
}: {
  data: ThreadControlStepSchema
}) => {
  const t = useTranslations()

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-1 px-4 py-2">
          <BaseStepViewer
            icon={ArrowRightLeftIcon}
            title={t("flows.actions.threadControl")}
          />
          <span className="text-muted-foreground text-xs">
            {t(THREAD_CONTROL_STEP_ACTION_KEYS[data.action])}
          </span>
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

export default ThreadControlStepViewer
