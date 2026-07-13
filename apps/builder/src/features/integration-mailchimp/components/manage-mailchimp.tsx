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
import { connectMailchimpAction } from "../actions/connect.action"
import { disconnectMailchimpAction } from "../actions/disconnect.action"
import { connectMailchimpSchema } from "../schemas"

export function ManageMailchimp(props: {
  workspaceId: string
  isConnected: boolean
}) {
  const [open, setOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const router = useRouter()
  const t = useTranslations()
  const featureName = t("fields.mailchimp.label")

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectMailchimpAction.bind(null, props.workspaceId),
    zodResolver(connectMailchimpSchema),
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
    disconnectMailchimpAction.bind(null, props.workspaceId),
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
      description={t("mailchimp.setting.description")}
      label={t("mailchimp.setting.label")}
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
