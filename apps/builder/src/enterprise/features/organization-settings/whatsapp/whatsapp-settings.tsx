"use client"

import {
  type OrganizationSettings,
  type WhatsappSettingsSchema,
  whatsappSettingsSchema,
} from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { SiWhatsapp, SiWhatsappHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { updateWhatsappSettingsAction } from "./update-whatsapp-settings.action"

export function WhatsappSettings({
  config,
}: {
  config: OrganizationSettings["whatsapp"]
}) {
  return (
    <Card className="w-96">
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiWhatsapp className="size-6" fill={SiWhatsappHex} />
          <span>WhatsApp</span>
        </CardTitle>
        <CardAction>
          <EditWhatsappSettingsDialog config={config ?? null} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <span className="font-bold">Client ID:</span>
            <span>{config?.clientId ?? "N/A"}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-bold">Business Name:</span>
            <span>{config?.businessName ?? "N/A"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function EditWhatsappSettingsDialog({
  config,
}: {
  config: WhatsappSettingsSchema | null
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>
          {t("messages.editFeature", { feature: "WhatsApp" })}
        </DialogTitle>

        <EditWhatsappSettingsForm
          config={config}
          onClose={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

export function EditWhatsappSettingsForm({
  config,
  onClose,
}: {
  config: WhatsappSettingsSchema | null
  onClose?: () => void
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateWhatsappSettingsAction,
      zodResolver(whatsappSettingsSchema),
      {
        actionProps: {
          onSuccess: () => {
            onClose?.()
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
            clientId: config?.clientId ?? "",
            clientSecret: config?.clientSecret ?? "",
            verifyToken: config?.verifyToken ?? "",
            version: config?.version ?? "v20.0",
            configId: config?.configId ?? "",
            systemUserId: config?.systemUserId ?? "",
            systemUserToken: config?.systemUserToken ?? "",
            businessId: config?.businessId ?? "",
            businessName: config?.businessName ?? "",
          },
        },
      },
    )

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.clientId.label")}
          name="clientId"
          required
        />

        <InputField
          label={t("fields.clientSecret.label")}
          name="clientSecret"
          required
          type="password"
        />

        <InputField
          label={t("fields.apiVersion.label")}
          name="version"
          required
        />

        <InputField
          label={t("fields.verifyToken.label")}
          name="verifyToken"
          required
        />

        <InputField
          label={t("fields.configId.label")}
          name="configId"
          required
        />

        <InputField
          label={t("fields.systemUserId.label")}
          name="systemUserId"
          required
        />

        <InputField
          label={t("fields.systemUserToken.label")}
          name="systemUserToken"
          required
          type="password"
        />

        <InputField label={t("fields.businessId.label")} name="businessId" />

        <InputField
          label={t("fields.businessName.label")}
          name="businessName"
          required
        />

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => {
              resetFormAndAction()
              onClose?.()
            }}
            type="button"
            variant="outline"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
