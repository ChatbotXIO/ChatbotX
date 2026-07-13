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
import { connectMoosendAction } from "../actions/connect.action"
import { disconnectMoosendAction } from "../actions/disconnect.action"
import { connectMoosendSchema } from "../schemas"

export function ManageMoosend(props: {
  workspaceId: string
  isConnected: boolean
}) {
  const [open, setOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const router = useRouter()
  const t = useTranslations()
  const featureName = t("fields.moosend.label")

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectMoosendAction.bind(null, props.workspaceId),
    zodResolver(connectMoosendSchema),
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

  const { executeAsync: disconnect, isPending } = useAction(
    disconnectMoosendAction.bind(null, props.workspaceId),
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
      description={t("moosend.setting.description")}
      label={t("moosend.setting.label")}
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
          credentialLabel={t("moosend.fields.apiKey")}
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
