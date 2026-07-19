"use client"

import type { QuestionnairesStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { ClipboardListIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export function QuestionnairesActionViewer({
  data,
}: {
  data: QuestionnairesStepSchema
}) {
  const t = useTranslations()
  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer
            icon={ClipboardListIcon}
            title={t("flows.actions.questionnaires")}
          />
          <div className="mt-1 text-muted-foreground text-xs">
            {t(`questionnaires.flowModes.${data.mode}`)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
