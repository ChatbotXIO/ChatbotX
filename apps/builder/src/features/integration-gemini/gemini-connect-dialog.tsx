"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { AiIntegrationApiKeyDialog } from "@/features/integration-ai/components/ai-integration-api-key-dialog"
import { useWorkspaceId } from "@/hooks/routing"
import { connectGeminiAction } from "./actions/connect.action"
import { connectGeminiRequest } from "./schemas/request"

export const GeminiConnectDialog = () => {
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectGeminiAction.bind(null, workspaceId),
    zodResolver(connectGeminiRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.connectedSuccess", {
              feature: t("fields.gemini.label"),
            }),
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
      title={t("fields.gemini.label")}
    />
  )
}
