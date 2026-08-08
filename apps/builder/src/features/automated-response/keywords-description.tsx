"use client"

import type { AutomatedResponseType } from "@chatbotx.io/database/partials"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type KeywordsDescriptionProps = {
  type: AutomatedResponseType
}

export function KeywordsDescription({ type }: KeywordsDescriptionProps) {
  const t = useTranslations()

  return (
    <div className="space-y-2">
      <h2 className="font-semibold text-base">
        {t(
          type === "inbound"
            ? "keywords.descriptions.contactTitle"
            : "keywords.descriptions.pageTitle",
        )}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t(
          type === "inbound"
            ? "keywords.descriptions.contact"
            : "keywords.descriptions.page",
        )}
      </p>
      {type === "outbound" && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>{t("keywords.pageWarning")}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
