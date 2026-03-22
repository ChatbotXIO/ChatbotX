"use client"

import {
  type OrganizationSettings,
  type ZaloSettingsSchema,
  zaloSettingsSchema,
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
import { SiZalo, SiZaloHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { updateZaloSettingsAction } from "./update-zalo-settings.action"

export function ZaloSettings({
  config,
}: {
  config: OrganizationSettings["zalo"]
}) {
  return (
    <Card className="w-96">
      <CardHeader className="items-center justify-center">
        <CardTitle className="flex items-center gap-2">
          <SiZalo className="size-6" fill={SiZaloHex} />
          <span>Zalo</span>
        </CardTitle>
        <CardAction>
          <EditZaloSettingsDialog config={config ?? null} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <span className="font-bold">Client ID:</span>
          <span>{config?.clientId ?? "N/A"}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function EditZaloSettingsDialog({
  config,
}: {
  config: ZaloSettingsSchema | null
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
          {t("messages.editFeature", { feature: "Zalo" })}
        </DialogTitle>

        <EditZaloSettingsForm
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

export function EditZaloSettingsForm({
  config,
  onClose,
}: {
  config: ZaloSettingsSchema | null
  onClose?: () => void
}) {
  const t = useTranslations()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateZaloSettingsAction,
      zodResolver(zaloSettingsSchema),
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
            version: config?.version ?? "v2.0",
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
