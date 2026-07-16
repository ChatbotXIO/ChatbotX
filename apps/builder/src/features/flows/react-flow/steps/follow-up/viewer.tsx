"use client"

import type { FollowUpStepSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"

type FollowUpStepViewerProps = {
  data: FollowUpStepSchema
}

const FollowUpStepViewer = ({ data }: FollowUpStepViewerProps) => {
  const t = useTranslations()

  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 py-0 text-center text-sm">
      <div>
        {t.rich("flows.followUp.waitAndContinue", {
          duration: data.duration,
          unit: data.unit,
          value: (chunks) => (
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {chunks}
            </span>
          ),
        })}
      </div>
      <div className="text-muted-foreground">
        {t("flows.followUp.cancelOnReplyHint")}
      </div>
    </div>
  )
}

export default FollowUpStepViewer
