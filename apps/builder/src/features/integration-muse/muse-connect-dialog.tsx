"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { AiIntegrationApiKeyDialog } from "@/features/integration-ai/components/ai-integration-api-key-dialog"
import { useWorkspaceId } from "@/hooks/routing"
import { connectMuseAction } from "./actions/connect.action"
import { connectMuseSchema } from "./schema/request"

export const MuseConnectDialog = () => {
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectMuseAction.bind(null, workspaceId),
    zodResolver(connectMuseSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.connectedSuccess", { feature: t("muse.title") }),
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
      description={t("muse.connect.embeddingHint")}
      form={form}
      onOpenChange={setOpen}
      onSubmit={handleSubmitWithAction}
      open={open}
      title={t("muse.title")}
    />
  )
}
