"use client"

import type { IntegrationSmtpModel } from "@chatbotx.io/database/types"
import {
  smtpHostMap,
  smtpProviders,
} from "@chatbotx.io/integration-smtp/schema"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { toast } from "sonner"
import { updateSmtpAction } from "../actions/update-smtp.action"
import { updateSmtpRequest } from "../schemas/mutation"
import { smtpProviderLabels } from "../schemas/resource"

type EditSmtpFormProps = {
  readonly workspaceId: string
  readonly integrationSmtp: IntegrationSmtpModel
  readonly onSuccess?: () => void
  readonly onCancel?: () => void
}

export const EditSmtpForm = ({
  workspaceId,
  integrationSmtp,
  onSuccess,
  onCancel,
}: EditSmtpFormProps) => {
  const t = useTranslations()
  const router = useRouter()

  const providerOptions = useMemo(
    () =>
      smtpProviders.options.map((value) => ({
        value,
        label: smtpProviderLabels[value],
      })),
    [],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateSmtpAction.bind(null, workspaceId, integrationSmtp.id),
    zodResolver(updateSmtpRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: "SMTP",
            }),
          )
          onSuccess?.()
          router.refresh()
        },
        onError: ({ error }) => {
          toast.error(error.serverError || "Failed to update SMTP integration")
        },
      },
      formProps: {
        defaultValues: {
          provider: "other",
          host: "",
          port: "",
          username: "",
          password: "",
          fromAddress: "",
        },
      },
    },
  )

  const selectedProvider = form.watch("provider")

  const handleProviderChange = (value: string) => {
    form.setValue("provider", value as (typeof smtpProviders.options)[number])
    const { host, port } =
      smtpHostMap[value as (typeof smtpProviders.options)[number]]
    form.setValue("host", host)
    form.setValue("port", port || 587)
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <SelectField
          label={t("fields.provider.label")}
          name="provider"
          onValueChange={handleProviderChange}
          options={providerOptions}
          required
        />

        <div className="flex gap-2">
          <InputField
            disabled={selectedProvider !== "other"}
            formItemClassName="flex-1"
            label={t("fields.host.label")}
            name="host"
            placeholder={t("fields.host.placeholder")}
            required={true}
          />

          <InputField
            disabled={selectedProvider !== "other"}
            formItemClassName="w-24"
            label={t("fields.port.label")}
            name="port"
            placeholder={t("fields.port.placeholder")}
            required={true}
            type="number"
          />
        </div>

        <Separator />

        <InputField
          label={t("fields.username.label")}
          name="username"
          placeholder={t("fields.username.placeholder")}
          required
        />

        <InputField
          label={t("fields.password.label")}
          name="password"
          placeholder={t("fields.password.placeholder")}
          required
          type="password"
        />

        <InputField
          label={t("fields.fromAddress.label")}
          name="fromAddress"
          placeholder={t("fields.fromAddress.placeholder")}
          required
          type="email"
        />

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} size="sm" type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
