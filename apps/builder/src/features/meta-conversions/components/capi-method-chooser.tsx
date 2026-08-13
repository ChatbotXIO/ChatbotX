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
import { useState } from "react"
import { toast } from "sonner"
import type { connectMessengerCustomCapiAction } from "@/features/integration-messenger/actions/connect-custom-capi.action"
import type { reconnectMessengerCapiAction } from "@/features/integration-messenger/actions/reconnect-capi.action"

// Messenger and Instagram CAPI actions share identical bind/input signatures,
// so the Messenger action types stand in as the shared contract for both tabs.
export type CapiMethodChooserActions = {
  oauthConnect: typeof reconnectMessengerCapiAction
  connectCustom: typeof connectMessengerCustomCapiAction
}

type CapiMethodChooserProps = {
  workspaceId: string
  integrationId: string
  datasetId: string | null
  actions: CapiMethodChooserActions
}

export function CapiMethodChooser({
  workspaceId,
  integrationId,
  datasetId,
  actions,
}: CapiMethodChooserProps) {
  const t = useTranslations()
  const router = useRouter()
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [datasetInput, setDatasetInput] = useState(datasetId ?? "")
  const [tokenInput, setTokenInput] = useState("")

  const onError = ({ error }: { error: { serverError?: string } }) => {
    toast.error(error.serverError ?? t("metaConversions.errors.saveFailed"))
  }

  const oauthConnect = useAction(
    actions.oauthConnect.bind(null, workspaceId, integrationId),
    {
      onError,
      // The action returns (instead of redirecting to OAuth) when the stored
      // token already has the permission — the in-place ManyChat-style path.
      onSuccess: () => {
        toast.success(t("metaConversions.connected"))
        router.refresh()
      },
    },
  )
  const connectCustom = useAction(
    actions.connectCustom.bind(null, workspaceId, integrationId),
    {
      onError,
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
            {t("metaConversions.methods.oauth.title")}
          </CardTitle>
          <CardDescription>
            {t("metaConversions.methods.oauth.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={oauthConnect.isPending}
            onClick={() => oauthConnect.execute()}
            type="button"
          >
            {oauthConnect.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : null}
            {t("metaConversions.methods.oauth.connect")}
          </Button>
        </CardContent>
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
