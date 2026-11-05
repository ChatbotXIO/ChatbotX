"use client"

import type { TemplateInstallSource } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useTranslations } from "next-intl"

/** "Automatic" for a copy a white-label default installed; nothing for one the installer chose. */
export function InstallSourceBadge({
  installSource,
}: {
  installSource: TemplateInstallSource
}) {
  const t = useTranslations()
  if (installSource !== "tenantDefault") {
    return null
  }
  return (
    <Badge
      title={t("templates.installs.installedAutomatically")}
      variant="outline"
    >
      {t("templates.installers.automatic")}
    </Badge>
  )
}
