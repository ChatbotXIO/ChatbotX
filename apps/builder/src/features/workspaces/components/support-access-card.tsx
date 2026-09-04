"use client"

import { isSupportAccessEnabled } from "@chatbotx.io/business"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { safeActionErrorHandler } from "@/lib/errors/safe-action-error-handler"
import { toggleSupportAccessAction } from "../actions/toggle-support-access.action"

export function SupportAccessCard({
  workspace,
  canManage,
}: {
  workspace: {
    id: string
    supportAccessUntil: Date | string | null
  }
  canManage: boolean
}) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()

  const [enabled, setEnabled] = useState(() =>
    isSupportAccessEnabled({
      supportAccessUntil: workspace.supportAccessUntil
        ? new Date(workspace.supportAccessUntil)
        : null,
    }),
  )

  useEffect(() => {
    setEnabled(
      isSupportAccessEnabled({
        supportAccessUntil: workspace.supportAccessUntil
          ? new Date(workspace.supportAccessUntil)
          : null,
      }),
    )
  }, [workspace.supportAccessUntil])

  const { execute, isPending } = useAction(
    toggleSupportAccessAction.bind(null, workspace.id),
    {
      onSuccess: ({ input }) => {
        setEnabled(input.enabled)
        toast.success(
          input.enabled
            ? t("workspace.supportAccess.enabledToast")
            : t("workspace.supportAccess.disabledToast"),
        )
        router.refresh()
      },
      onError: safeActionErrorHandler,
    },
  )

  const enabledUntilText = workspace.supportAccessUntil
    ? t("workspace.supportAccess.enabledUntil", {
        time: formatDate(workspace.supportAccessUntil, {
          hour: "numeric",
          minute: "numeric",
          locale,
        }),
      })
    : null

  const switchElement = (
    <Switch
      checked={enabled}
      disabled={!canManage || isPending}
      onCheckedChange={(checked) => execute({ enabled: checked })}
    />
  )

  return (
    <Card>
      <CardContent>
        <SettingRow
          description={
            <>
              <p>{t("workspace.supportAccess.cardDescription")}</p>
              {enabled && enabledUntilText && <p>{enabledUntilText}</p>}
            </>
          }
          label={t("workspace.supportAccess.cardTitle")}
        >
          {canManage ? (
            switchElement
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={<span className="inline-flex">{switchElement}</span>}
              />
              <TooltipContent>
                {t("workspace.supportAccess.permissionRequired")}
              </TooltipContent>
            </Tooltip>
          )}
        </SettingRow>
      </CardContent>
    </Card>
  )
}
