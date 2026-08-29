"use client"

import type { TemplateModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useTenantSettings } from "@/features/tenant"
import { useClipboard } from "@/hooks/use-clipboard"
import { updateShareSettingsAction } from "../actions/update-share-settings.action"

type TemplateShareCardProps = {
  workspaceId: string
  template: TemplateModel
}

export function TemplateShareCard({
  workspaceId,
  template,
}: TemplateShareCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const { appUrl } = useTenantSettings()
  const { handleCopy } = useClipboard()

  const { execute, isPending } = useAction(
    updateShareSettingsAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const shareUrl = `${appUrl}/t/${template.shareToken}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("templates.share.label")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="font-medium text-sm">
              {template.shareEnabled
                ? t("templates.share.enabled")
                : t("templates.share.disabled")}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("templates.share.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPending && (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            )}
            <Switch
              checked={template.shareEnabled}
              disabled={isPending}
              onCheckedChange={(shareEnabled) =>
                execute({ templateId: template.id, shareEnabled })
              }
            />
          </div>
        </div>

        {template.shareEnabled && (
          <div className="flex items-center gap-2">
            <span className="truncate text-sm">{shareUrl}</span>
            <Button
              className="flex-none"
              onClick={() => handleCopy(shareUrl)}
              size="icon"
              type="button"
              variant="outline"
            >
              <CopyIcon className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
