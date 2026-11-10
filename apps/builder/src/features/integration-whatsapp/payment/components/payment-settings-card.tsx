"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { updatePixRedirectAction } from "../actions/update-pix-redirect.action"

type PaymentSettingsCardProps = {
  workspaceId: string
  integrationWhatsappId: string
  pixRedirectEnabled: boolean
  isSuperAdmin: boolean
}

/**
 * WhatsApp number settings for payment request buttons. The only local choice
 * is whether Pix buttons are sent with redirect; Meta has to onboard the
 * business first, and buyers whose app cannot redirect still get copy & paste.
 * The switch shows what the server last accepted and rolls back on failure.
 */
export function PaymentSettingsCard({
  workspaceId,
  integrationWhatsappId,
  pixRedirectEnabled,
  isSuperAdmin,
}: PaymentSettingsCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const [confirmed, setConfirmed] = useState(pixRedirectEnabled)

  const { execute, isExecuting } = useAction(
    updatePixRedirectAction.bind(null, workspaceId, integrationWhatsappId),
    {
      onSuccess: ({ data }) => {
        setConfirmed(data?.pixRedirectEnabled ?? false)
        // The settings page is a server component: re-read it so coming back
        // to the page never shows the value from before this change.
        router.refresh()
        toast.success(t("messages.savedSuccessfully"))
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("whatsapp.payment.settings.title")}</CardTitle>
        <CardDescription>
          {t("whatsapp.payment.settings.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pix-redirect-enabled">
            {t("whatsapp.payment.settings.pixRedirectLabel")}
          </Label>
          <div className="flex items-center gap-2">
            {isExecuting && (
              <Loader2Icon
                aria-hidden
                className="size-4 animate-spin text-muted-foreground"
              />
            )}
            <Switch
              checked={confirmed}
              disabled={!isSuperAdmin || isExecuting}
              id="pix-redirect-enabled"
              onCheckedChange={(checked) =>
                execute({ pixRedirectEnabled: checked })
              }
            />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {isSuperAdmin
            ? t("whatsapp.payment.settings.pixRedirectDescription")
            : t("whatsapp.payment.settings.adminOnly")}
        </p>
      </CardContent>
    </Card>
  )
}
