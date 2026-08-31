"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { SettingRow } from "@/components/setting-row"

export function ManageMake({
  inviteUrl,
  hasWorkspaceToken,
}: {
  inviteUrl?: string
  // Tokens are stored hashed and shown once at generation, so this component
  // can no longer read (or auto-copy) the plaintext — it only knows whether a
  // token exists and points the user at the token section when it doesn't.
  hasWorkspaceToken: boolean
}) {
  const t = useTranslations()

  return (
    <SettingRow
      description={t("make.setting.description")}
      label={t("make.setting.label")}
    >
      {inviteUrl ? (
        <div className="flex flex-col gap-2">
          <a
            className={buttonVariants({ size: "sm", variant: "secondary" })}
            href={inviteUrl}
            rel="noreferrer"
            target="_blank"
          >
            {t("actions.connect")}
          </a>
          {!hasWorkspaceToken && (
            <p className="text-muted-foreground text-xs">
              {t("make.setting.noWorkspaceToken")}
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("make.setting.notConfigured")}
        </p>
      )}
    </SettingRow>
  )
}
