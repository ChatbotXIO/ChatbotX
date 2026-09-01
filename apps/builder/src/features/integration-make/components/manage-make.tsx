"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { SettingRow } from "@/components/setting-row"

export function ManageMake({ inviteUrl }: { inviteUrl?: string }) {
  const t = useTranslations()

  return (
    <SettingRow
      description={t("make.setting.description")}
      label={t("make.setting.label")}
    >
      {inviteUrl ? (
        <a
          className={buttonVariants({ size: "sm", variant: "secondary" })}
          href={inviteUrl}
          rel="noreferrer"
          target="_blank"
        >
          {t("actions.connect")}
        </a>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("make.setting.notConfigured")}
        </p>
      )}
    </SettingRow>
  )
}
