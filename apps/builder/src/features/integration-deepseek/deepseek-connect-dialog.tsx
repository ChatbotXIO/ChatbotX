"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { AiIntegrationApiKeyDialog } from "@/features/integration-ai/components/ai-integration-api-key-dialog"
import { useWorkspaceId } from "@/hooks/routing"
import { connectDeepSeekAction } from "./actions/connect.action"
import { connectDeepSeekSchema } from "./schemas/request"

export const DeepSeekConnectDialog = () => {
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectDeepSeekAction.bind(null, workspaceId),
    zodResolver(connectDeepSeekSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.connectedSuccess", { feature: t("deepseek.title") }),
          )
          setOpen(false)
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { apiKey: "" },
      },
    },
  )

  return (
    <AiIntegrationApiKeyDialog
      form={form}
      onOpenChange={setOpen}
      onSubmit={handleSubmitWithAction}
      open={open}
      title={t("deepseek.title")}
    />
  )
}
