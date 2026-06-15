"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { downloadQrCodeAsPng } from "@chatbotx.io/ui/lib/qr-code"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { QrCodeLinkContent } from "@/features/qr-codes/qr-code-link-content"
import { useTenantSettings } from "@/features/tenant"
import { updateQrCodeAction } from "./actions/update-qr-code.action"
import { QR_CODE_SIZE, stripQrPrefix } from "./constants"
import { updateQrCodeRequest } from "./schemas/action"
import type { QrCodeResource } from "./schemas/resource"

export function UpdateQrCodeForm({
  workspaceId,
  qrCode,
}: {
  workspaceId: string
  qrCode: QrCodeResource
}) {
  const t = useTranslations()
  const router = useRouter()
  const flowOptions = useFlowSelectOptions()
  const { appUrl } = useTenantSettings()

  const landingPageUrl = `${appUrl}/l/${workspaceId}/${qrCode.id}`

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateQrCodeAction.bind(null, workspaceId, qrCode.id),
    zodResolver(updateQrCodeRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.qrCode.label"),
            }),
          )
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
        defaultValues: {
          name: stripQrPrefix(qrCode.name),
          flowId: qrCode.flowId,
          size: qrCode.qrStyles?.size ?? QR_CODE_SIZE.DEFAULT,
        },
      },
    },
  )

  const download = async () => {
    const svgElement = document
      .getElementById("qr-code-preview")
      ?.querySelector("svg")
    if (!svgElement) {
      return
    }
    await downloadQrCodeAsPng(
      svgElement as SVGSVGElement,
      form.getValues("name") || "qr-code",
      Number(form.getValues("size") ?? QR_CODE_SIZE.DEFAULT),
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            {t("messages.editFeature", { feature: t("fields.qrCode.label") })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-6" onSubmit={handleSubmitWithAction}>
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
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.save")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("fields.qrCode.label")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <QrCodeLinkContent link={landingPageUrl} />
          <Button onClick={download}>{t("actions.download")}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
