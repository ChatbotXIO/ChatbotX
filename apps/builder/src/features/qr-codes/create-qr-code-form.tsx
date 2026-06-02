"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { createQrCodeAction } from "./actions/create-qr-code.action"
import { QR_CODE_SIZE } from "./constants"
import { createQrCodeRequest } from "./schemas/action"

export function CreateQrCodeForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const router = useRouter()
  const flowOptions = useFlowSelectOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createQrCodeAction.bind(null, workspaceId),
    zodResolver(createQrCodeRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.qrCode.label"),
            }),
          )
          if (data?.id) {
            router.push(`/space/${workspaceId}/qr-codes/${data.id}/edit`)
          } else {
            router.push(`/space/${workspaceId}/qr-codes`)
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          flowId: "",
          size: QR_CODE_SIZE.DEFAULT,
        },
      },
    },
  )

  return (
    <Form {...form}>
      <form className="flex-1 space-y-6" onSubmit={handleSubmitWithAction}>
        <InputField label={t("fields.name.label")} name="name" required />

        <ComboboxField
          label={t("fields.botResponse.label")}
          name="flowId"
          options={flowOptions}
          required
        />

        <InputField
          label={t("fields.size.label")}
          max={QR_CODE_SIZE.MAX}
          min={QR_CODE_SIZE.MIN}
          name="size"
          type="number"
        />

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => router.push(`/space/${workspaceId}/qr-codes`)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.create")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
