"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DialogFooter } from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { toast } from "sonner"
import { createEmailAction } from "../actions/create-email.action"
import { createEmailRequest, emailProviders } from "../schema/mutation"

type CreateEmailFormProps = {
  readonly workspaceId: string
}

export const CreateEmailForm = ({ workspaceId }: CreateEmailFormProps) => {
  const t = useTranslations()
  const router = useRouter()

  const providerOptions = useMemo(
    () =>
      emailProviders.options.map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      })),
    [],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    createEmailAction,
    zodResolver(createEmailRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: "Email",
            }),
          )
          router.push(`/space/${workspaceId}/settings/channels?channel=email`)
        },
        onError: ({ error }) => {
          toast.error(error.serverError || "Failed to create email integration")
        },
      },
      formProps: {
        defaultValues: {
          workspaceId,
          name: "",
          provider: "gmail",
          host: "",
          port: 587,
          username: "",
          password: "",
          fromAddress: "",
        },
      },
    },
  )

  const selectedProvider = form.watch("provider")

  const handleProviderChange = (value: string) => {
    form.setValue("provider", value as "gmail" | "outlook" | "other")
    if (value === "gmail") {
      form.setValue("host", "smtp.gmail.com")
      form.setValue("port", 587)
    } else if (value === "outlook") {
      form.setValue("host", "smtp.office365.com")
      form.setValue("port", 587)
    }
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <InputField label={t("fields.name.label")} name="name" required />

        <Separator />

        <SelectField
          label="Provider"
          name="provider"
          onValueChange={handleProviderChange}
          options={providerOptions}
          required
        />

        <InputField
          disabled={selectedProvider !== "other"}
          label="SMTP Host"
          name="host"
          placeholder="smtp.example.com"
          required
        />

        <InputField
          disabled={selectedProvider !== "other"}
          label="SMTP Port"
          name="port"
          placeholder="587"
          required
          type="number"
        />

        <Separator />

        <InputField
          label="Username"
          name="username"
          placeholder="user@example.com"
          required
        />

        <InputField
          label="Password"
          name="password"
          placeholder="••••••••"
          required
          type="password"
        />

        <InputField
          label="From Address"
          name="fromAddress"
          placeholder="noreply@example.com"
          required
          type="email"
        />

        <DialogFooter>
          <Button asChild size="sm" variant="ghost">
            <Link
              href={`/space/${workspaceId}/settings/channels?channel=email`}
            >
              {t("actions.cancel")}
            </Link>
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            Create Email
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
