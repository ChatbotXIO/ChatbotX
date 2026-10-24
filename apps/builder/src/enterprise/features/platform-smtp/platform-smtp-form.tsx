"use client"

import {
  type SmtpCredentialPublic,
  smtpCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { DeleteCredentialDialog } from "@/features/platform-credentials/delete-credential-dialog"
import { deletePlatformSmtpAction } from "./delete-platform-smtp.action"
import { updatePlatformSmtpAction } from "./update-platform-smtp.action"

type PlatformSmtpFormProps = {
  settings: SmtpCredentialPublic | null
}

export function PlatformSmtpForm({ settings }: PlatformSmtpFormProps) {
  const t = useTranslations()
  const router = useRouter()

  const { execute: executeDelete, isPending: isDeleting } = useAction(
    deletePlatformSmtpAction,
    {
      onSuccess: () => {
        toast.success(t("messages.deletedSuccess", { feature: "SMTP" }))
        router.refresh()
      },
      onError: ({ error }) =>
        error.serverError && toast.error(error.serverError),
    },
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    updatePlatformSmtpAction,
    zodResolver(smtpCredentialUpdateSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("messages.updatedSuccess", { feature: "SMTP" }))
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
          host: settings?.host ?? "",
          port: settings?.port ?? 587,
          username: settings?.username ?? "",
          password: "",
          fromEmail: settings?.fromEmail ?? "",
          fromName: settings?.fromName ?? "",
        },
      },
    },
  )

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        {!settings && (
          <p className="text-muted-foreground text-sm">
            {t("platformAdmin.smtp.usingEnv")}
          </p>
        )}

        <InputField label={t("fields.host.label")} name="host" required />
        <InputField
          label={t("fields.port.label")}
          name="port"
          required
          type="number"
        />
        <InputField
          label={t("fields.username.label")}
          name="username"
          required
        />
        <InputField
          description={
            settings ? t("messages.leaveEmptyToKeepSecret") : undefined
          }
          label={t("fields.password.label")}
          name="password"
          required={!settings}
          type="password"
        />
        <InputField
          label={t("fields.fromAddress.label")}
          name="fromEmail"
          required
        />
        <InputField label={t("fields.fromName.label")} name="fromName" />

        <div className="flex items-center justify-between gap-2">
          {settings && (
            <DeleteCredentialDialog
              disabled={form.formState.isSubmitting}
              feature="SMTP"
              isDeleting={isDeleting}
              onConfirm={() => executeDelete()}
              triggerLabel={t("platformAdmin.smtp.remove")}
            />
          )}
          <div className="ms-auto flex gap-2">
            <Button
              disabled={
                !form.formState.isValid ||
                form.formState.isSubmitting ||
                isDeleting
              }
              type="submit"
            >
              {form.formState.isSubmitting && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {t("actions.save")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
