"use client"

import { DonutChart } from "@chatbotx.io/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ContactsByLanguageChart() {
  const t = useTranslations()
  const contactsByLanguage = useAnalysisStore(
    (state) => state.contactsByLanguage,
  )

  const data = useMemo(
    () =>
      contactsByLanguage.map((item) => {
        // Same translated names as the contact filter's Language option; a
        // code without a translation is shown as stored.
        const labelKey = `condition.languages.${item.dimension}`
        return {
          name:
            item.dimension && t.has(labelKey)
              ? t(labelKey)
              : item.dimension || t("analytics.unknown"),
          value: item.uniqueContacts,
        }
      }),
    [contactsByLanguage, t],
  )

  return (
    <DonutChart
      data={data}
      noDataLabel={t("analytics.noData")}
      title={t("analytics.newContactsByLanguage")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
