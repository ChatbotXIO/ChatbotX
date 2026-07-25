"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { SettingRow } from "@/components/setting-row"
import { useClipboard } from "@/hooks/use-clipboard"

export function ManageMake({
  inviteUrl,
  workspaceToken,
}: {
  inviteUrl?: string
  workspaceToken?: string
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  return (
    <SettingRow
      description={t("make.setting.description")}
      label={t("make.setting.label")}
    >
      {inviteUrl ? (
        <div className="flex flex-col gap-2">
          <Button asChild size="sm" variant="secondary">
            <a
              href={inviteUrl}
              onClick={() => {
                if (workspaceToken) {
                  handleCopy(workspaceToken)
                }
              }}
              rel="noreferrer"
              target="_blank"
            >
              {t("actions.connect")}
            </a>
          </Button>
          {!workspaceToken && (
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
