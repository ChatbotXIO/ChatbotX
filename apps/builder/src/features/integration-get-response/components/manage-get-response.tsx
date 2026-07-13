"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { AiIntegrationApiKeyDialog } from "@/features/integration-ai/components/ai-integration-api-key-dialog"
import { connectGetResponseAction } from "../actions/connect.action"
import { disconnectGetResponseAction } from "../actions/disconnect.action"
import { connectGetResponseSchema } from "../schemas"

export function ManageGetResponse(props: {
  workspaceId: string
  isConnected: boolean
}) {
  const [open, setOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const router = useRouter()
  const t = useTranslations()
  const featureName = t("fields.getResponse.label")

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectGetResponseAction.bind(null, props.workspaceId),
    zodResolver(connectGetResponseSchema),
    {
      actionProps: {
        onSuccess: () => {
          setOpen(false)
          router.refresh()
          toast.success(t("messages.connectSuccess", { feature: featureName }))
        },
        onError: ({ error }) =>
          error.serverError && toast.error(error.serverError),
      },
      formProps: { mode: "onChange", defaultValues: { apiKey: "" } },
    },
  )

  const { execute: disconnect, isPending } = useAction(
    disconnectGetResponseAction.bind(null, props.workspaceId),
    {
      onSuccess: () => {
        setDisconnectOpen(false)
        router.refresh()
        toast.success(t("messages.disconnectSuccess", { feature: featureName }))
      },
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
    },
  )

  return (
    <SettingRow
      description={t("getResponse.setting.description")}
      label={t("getResponse.setting.label")}
    >
      {props.isConnected ? (
        <DisconnectIntegrationDialog
          featureLabel={featureName}
          isPending={isPending}
          onConfirm={disconnect}
          onOpenChange={setDisconnectOpen}
          open={disconnectOpen}
        />
      ) : (
        <AiIntegrationApiKeyDialog
          credentialLabel={t("getResponse.fields.apiKey")}
          form={form}
          onOpenChange={setOpen}
          onSubmit={handleSubmitWithAction}
          open={open}
          title={featureName}
        />
      )}
    </SettingRow>
  )
}
