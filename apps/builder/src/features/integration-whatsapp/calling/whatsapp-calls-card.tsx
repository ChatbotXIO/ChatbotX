"use client"

import type { WhatsappCallingSettings } from "@chatbotx.io/integration-whatsapp/api/calling"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { AlertCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { updateWhatsappCallingSettingsAction } from "./actions/update-calling-settings.action"
import type { UpdateWhatsappCallingSettingsSchema } from "./schemas/update-calling-settings-schema"

type WhatsappCallsCardProps = {
  workspaceId: string
  integrationWhatsappId: string
  settings: WhatsappCallingSettings | null
  loadError?: string
}

type ToggleRowProps = {
  label: string
  helper: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (next: boolean) => void
}

const ToggleRow = ({
  label,
  helper,
  checked,
  disabled,
  onCheckedChange,
}: ToggleRowProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-sm">{label}</span>
      <span className="text-muted-foreground text-xs">{helper}</span>
    </div>
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    />
  </div>
)

export function WhatsappCallsCard({
  workspaceId,
  integrationWhatsappId,
  settings,
  loadError,
}: WhatsappCallsCardProps) {
  const t = useTranslations()
  const [current, setCurrent] = useState<WhatsappCallingSettings>(
    settings ?? { status: "DISABLED" },
  )

  const { execute, isPending } = useAction(
    updateWhatsappCallingSettingsAction.bind(
      null,
      workspaceId,
      integrationWhatsappId,
    ),
    {
      onSuccess: () => {
        toast.success(t("messages.savedSuccessfully"))
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )

  const apply = (
    input: UpdateWhatsappCallingSettingsSchema,
    next: WhatsappCallingSettings,
  ) => {
    setCurrent(next)
    execute(input)
  }

  const isCallingEnabled = current.status === "ENABLED"

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("whatsapp.calls.title")}</CardTitle>
          <CardDescription>{t("whatsapp.calls.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertDescription>
              {t("whatsapp.calls.loadFailed")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("whatsapp.calls.title")}</CardTitle>
        <CardDescription>{t("whatsapp.calls.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ToggleRow
          checked={isCallingEnabled}
          disabled={isPending}
          helper={t("whatsapp.calls.enableHelper")}
          label={t("whatsapp.calls.enableLabel")}
          onCheckedChange={(next) =>
            apply(
              { status: next ? "ENABLED" : "DISABLED" },
              { ...current, status: next ? "ENABLED" : "DISABLED" },
            )
          }
        />
        <ToggleRow
          checked={current.call_icon_visibility !== "DISABLE_ALL"}
          disabled={isPending || !isCallingEnabled}
          helper={t("whatsapp.calls.iconVisibilityHelper")}
          label={t("whatsapp.calls.iconVisibilityLabel")}
          onCheckedChange={(next) =>
            apply(
              { callIconVisibility: next ? "DEFAULT" : "DISABLE_ALL" },
              {
                ...current,
                call_icon_visibility: next ? "DEFAULT" : "DISABLE_ALL",
              },
            )
          }
        />
        <ToggleRow
          checked={current.callback_permission_status === "ENABLED"}
          disabled={isPending || !isCallingEnabled}
          helper={t("whatsapp.calls.callbackPermissionHelper")}
          label={t("whatsapp.calls.callbackPermissionLabel")}
          onCheckedChange={(next) =>
            apply(
              { callbackPermissionStatus: next ? "ENABLED" : "DISABLED" },
              {
                ...current,
                callback_permission_status: next ? "ENABLED" : "DISABLED",
              },
            )
          }
        />
        <p className="text-muted-foreground text-xs">
          {t("whatsapp.calls.propagationNote")}
        </p>
      </CardContent>
    </Card>
  )
}
