"use client"

import {
  checkoutModes,
  type EcommerceCheckoutSettings,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { PRICE_INPUT_PROPS } from "@/features/products/constants"
import type { EcommerceSettingsPublicResource } from "../schema/public"
import { SettingRow, SettingsSaveBar } from "./setting-row"
import { useSettingsSave } from "./use-settings-save"

type CheckoutFormValues = Omit<
  EcommerceCheckoutSettings,
  "checkoutLink" | "checkoutFlowId"
> & {
  checkoutLink: string
  checkoutFlowId: string | undefined
}

const REQUIRED_FIELDS = [
  "requireName",
  "requireEmail",
  "requirePhone",
  "requireState",
  "requireZip",
] as const

export function CheckoutSettingsForm({
  workspaceId,
  settings,
  flowOptions,
}: {
  workspaceId: string
  settings: EcommerceSettingsPublicResource
  flowOptions: Array<{ id: string; name: string }>
}) {
  const t = useTranslations("ecommerceSettings.checkout")
  const { execute, isPending } = useSettingsSave(workspaceId)

  const form = useForm<CheckoutFormValues>({
    defaultValues: {
      ...settings.checkout,
      checkoutLink: settings.checkout.checkoutLink ?? "",
      checkoutFlowId: settings.checkout.checkoutFlowId ?? undefined,
    },
  })
  const checkoutMode = form.watch("checkoutMode")

  const onSubmit = form.handleSubmit((values) => {
    execute({
      checkout: {
        ...values,
        // An emptied number field means no minimum.
        minimumOrderValue: Number(values.minimumOrderValue) || 0,
        checkoutLink: values.checkoutLink.trim() || null,
        checkoutFlowId: values.checkoutFlowId || null,
      },
    })
  })

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <SettingRow
          description={t("checkoutMode.description")}
          label={t("checkoutMode.label")}
        >
          <SelectField
            name="checkoutMode"
            options={checkoutModes.options.map((mode) => ({
              value: mode,
              label: t(`checkoutMode.options.${mode}`),
            }))}
          />
        </SettingRow>
        {checkoutMode === "externalLink" ? (
          <SettingRow
            description={t("checkoutLink.description")}
            label={t("checkoutLink.label")}
          >
            <InputField name="checkoutLink" placeholder="https://" type="url" />
          </SettingRow>
        ) : null}
        {checkoutMode === "flow" ? (
          <SettingRow
            description={t("checkoutFlowId.description")}
            label={t("checkoutFlowId.label")}
          >
            <SelectField
              name="checkoutFlowId"
              options={flowOptions.map((flow) => ({
                value: flow.id,
                label: flow.name,
              }))}
              placeholder={t("checkoutFlowId.placeholder")}
            />
          </SettingRow>
        ) : null}
        <SettingRow
          description={t("minimumOrderValue.description")}
          label={t("minimumOrderValue.label")}
        >
          <InputNumberField
            min={0}
            name="minimumOrderValue"
            {...PRICE_INPUT_PROPS}
          />
        </SettingRow>
        {REQUIRED_FIELDS.map((field) => (
          <SettingRow
            description={t(`requiredFields.${field}.description`)}
            key={field}
            label={t(`requiredFields.${field}.label`)}
          >
            <SwitchField name={field} />
          </SettingRow>
        ))}
        <SettingsSaveBar isSaving={isPending} />
      </form>
    </Form>
  )
}
