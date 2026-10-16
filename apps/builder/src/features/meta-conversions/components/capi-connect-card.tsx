"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Loader2Icon, PlugZapIcon, SettingsIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import type { connectMessengerCustomCapiAction } from "@/features/integration-messenger/actions/connect-custom-capi.action"

type CapiConnectCardProps = {
  workspaceId: string
  integrationId: string
  datasetId: string | null
  // Messenger, Instagram and WhatsApp custom-connect actions share one
  // signature; the Messenger action type stands in as the shared contract.
  connectCustomAction: typeof connectMessengerCustomCapiAction
  /** The channel's own Connect button: an OAuth redirect or an Embedded Signup popup. */
  connectSlot: ReactNode
}

/**
 * What a not-connected integration shows: the channel's Connect button first,
 * and — collapsed, for admins who already hold a system-user token — the option
 * to paste their own dataset id and access token instead.
 */
export function CapiConnectCard({
  workspaceId,
  integrationId,
  datasetId,
  connectCustomAction,
  connectSlot,
}: CapiConnectCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [datasetInput, setDatasetInput] = useState(datasetId ?? "")
  const [tokenInput, setTokenInput] = useState("")

  const connectCustom = useAction(
    connectCustomAction.bind(null, workspaceId, integrationId),
    {
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("metaConversions.errors.saveFailed"))
      },
      onSuccess: () => {
        setTokenInput("")
        toast.success(t("metaConversions.connected"))
        router.refresh()
      },
    },
  )

  const customFormComplete =
    datasetInput.trim().length > 0 && tokenInput.trim().length > 0

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlugZapIcon className="size-4" />
            {t("metaConversions.connect.title")}
          </CardTitle>
          <CardDescription>
            {t("metaConversions.connect.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>{connectSlot}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SettingsIcon className="size-4" />
            {t("metaConversions.methods.custom.title")}
          </CardTitle>
          <CardDescription>
            {t("metaConversions.methods.custom.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showCustomForm ? (
            <div className="flex flex-col gap-3">
              <Input
                className="font-mono"
                onChange={(event) => setDatasetInput(event.target.value)}
                placeholder={t("metaConversions.datasetIdPlaceholder")}
                value={datasetInput}
              />
              <Input
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder={t("metaConversions.accessTokenPlaceholder")}
                type="password"
                value={tokenInput}
              />
              <div>
                <Button
                  disabled={connectCustom.isPending || !customFormComplete}
                  onClick={() =>
                    connectCustom.execute({
                      datasetId: datasetInput.trim(),
                      accessToken: tokenInput.trim(),
                    })
                  }
                  type="button"
                >
                  {connectCustom.isPending ? (
                    <Loader2Icon className="animate-spin" />
                  ) : null}
                  {t("metaConversions.methods.custom.connect")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowCustomForm(true)}
              type="button"
              variant="secondary"
            >
              {t("metaConversions.methods.custom.start")}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
