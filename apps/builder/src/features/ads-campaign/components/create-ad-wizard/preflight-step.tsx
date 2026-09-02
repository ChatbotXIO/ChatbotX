"use client"

import { messagingAdConfigByChannel } from "@chatbotx.io/integration-facebook-ads"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { AlertTriangleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import type {
  WizardFormValues,
  WizardMessagingAdChannel,
} from "./wizard-form-schema"

type Props = {
  channel: WizardMessagingAdChannel
}

export function PreflightStep({ channel }: Props) {
  const t = useTranslations()
  const { control } = useFormContext<WizardFormValues>()
  const values = useWatch({ control })
  const config = messagingAdConfigByChannel[channel]

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangleIcon className="size-4" />
        <AlertDescription>
          {t("adsCampaign.preflight.pausedNote")}
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <div className="space-y-2 text-sm">
          <Row label={t("fields.name.label")} value={values.name ?? "-"} />
          <Row
            label={t("adsCampaign.fields.adAccount.label")}
            value={values.adAccountId ?? "-"}
          />
          <Row
            label={t("adsCampaign.fields.destination.label")}
            value={config.destinationType}
          />
          <Row
            label={t("adsCampaign.fields.dailyBudget.label")}
            value={String(values.dailyBudgetMinorUnits ?? "-")}
          />
          <Row
            label={t("adsCampaign.fields.countries.label")}
            value={(values.countries ?? []).join(", ") || "-"}
          />
          <Row
            label={t("adsCampaign.fields.specialAdCategory.label")}
            value={
              (values.specialAdCategories ?? []).join(", ") ||
              t("adsCampaign.specialAdCategory.none")
            }
          />
          <Row
            label={t("adsCampaign.creative.mediaType.label")}
            value={values.mediaKind || "-"}
          />
          <Row
            label={t("adsCampaign.welcomeMessage.label")}
            value={t(
              `adsCampaign.welcomeMessage.mode.${values.welcomeMessageType ?? "default"}`,
            )}
          />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
