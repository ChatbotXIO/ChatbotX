"use client"

import {
  type SmtpCredentialPublic,
  smtpCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { deletePlatformSmtpAction } from "./delete-platform-smtp.action"
import { updatePlatformSmtpAction } from "./update-platform-smtp.action"

type PlatformSmtpFormProps = {
  settings: SmtpCredentialPublic | null
}

function RemovePlatformSmtpDialog({
  isDeleting,
  disabled,
  onConfirm,
}: {
  isDeleting: boolean
  disabled?: boolean
  onConfirm: () => void
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const wasDeleting = useRef(false)

  useEffect(() => {
    if (wasDeleting.current && !isDeleting) {
      setOpen(false)
    }
    wasDeleting.current = isDeleting
  }, [isDeleting])

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            disabled={isDeleting || disabled}
            type="button"
            variant="destructive"
          >
            {t("platformAdmin.smtp.remove")}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("messages.deleteFeature", { feature: "SMTP" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.deleteConfirmation", { feature: "SMTP" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t("actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
          >
            {isDeleting && <Loader2Icon className="me-2 size-4 animate-spin" />}
            {t("actions.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
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
            <RemovePlatformSmtpDialog
              disabled={form.formState.isSubmitting}
              isDeleting={isDeleting}
              onConfirm={() => executeDelete()}
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
