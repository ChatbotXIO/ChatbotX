"use client"

import type { TemplateDetail } from "@chatbotx.io/business"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { ShareSettingsPanel } from "./share-settings-panel"

type TemplateShareCardProps = {
  workspaceId: string
  template: TemplateDetail
}

export function TemplateShareCard({
  workspaceId,
  template,
}: TemplateShareCardProps) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("templates.share.label")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-muted-foreground text-sm">
          {t("templates.share.description")}
        </p>
        <ShareSettingsPanel template={template} workspaceId={workspaceId} />
      </CardContent>
    </Card>
  )
}
