"use client"

import {
  checkoutModes,
  type EcommerceCheckoutSettings,
  orderConfirmationModes,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { PRICE_INPUT_PROPS } from "@/features/products/constants"
import type { FieldRule } from "@/lib/validation/use-request-resolver"
import { useInvalidFormToast } from "@/lib/validation/use-request-resolver"
import type { EcommerceSettingsPublicResource } from "../schema/public"
import { SettingRow, SettingsSaveBar } from "./setting-row"
import { useSettingsResolver } from "./use-settings-resolver"
import { useSettingsSave } from "./use-settings-save"

type CheckoutFormValues = Omit<
  EcommerceCheckoutSettings,
  "checkoutLink" | "checkoutFlowId" | "orderConfirmationFlowId"
> & {
  checkoutLink: string
  checkoutFlowId: string | undefined
  orderConfirmationFlowId: string | undefined
}

const REQUIRED_FIELDS = [
  "requireName",
  "requireEmail",
  "requirePhone",
  "requireState",
  "requireZip",
] as const

const toRequest = (values: CheckoutFormValues) => ({
  checkout: {
    ...values,
    // An emptied number field means no minimum.
    minimumOrderValue: Number(values.minimumOrderValue) || 0,
    checkoutLink: values.checkoutLink.trim() || null,
    checkoutFlowId: values.checkoutFlowId || null,
    orderConfirmationFlowId: values.orderConfirmationFlowId || null,
  },
})

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
  const tValidation = useTranslations("validation.form")
  const tCommon = useTranslations()
  const { execute, isPending } = useSettingsSave(workspaceId)
  const showInvalidToast = useInvalidFormToast()
  /** The service's checks: each checkout mode needs its own target. */
  const rules = (
    values: CheckoutFormValues,
  ): Array<FieldRule<CheckoutFormValues> | false> => [
    values.checkoutMode === "externalLink" &&
      !values.checkoutLink.trim() && {
        field: "checkoutLink",
        message: tValidation("required"),
      },
    values.checkoutMode === "flow" &&
      !values.checkoutFlowId && {
        field: "checkoutFlowId",
        message: tValidation("required"),
      },
    values.orderConfirmationMode === "flow" &&
      !values.orderConfirmationFlowId && {
        field: "orderConfirmationFlowId",
        message: tValidation("required"),
      },
  ]
  const resolver = useSettingsResolver(toRequest, rules)

  const form = useForm<CheckoutFormValues>({
    resolver,
    defaultValues: {
      ...settings.checkout,
      checkoutLink: settings.checkout.checkoutLink ?? "",
      checkoutFlowId: settings.checkout.checkoutFlowId ?? undefined,
      orderConfirmationFlowId:
        settings.checkout.orderConfirmationFlowId ?? undefined,
    },
  })
  const checkoutMode = form.watch("checkoutMode")
  const orderConfirmationMode = form.watch("orderConfirmationMode")
  const flowSelectOptions = flowOptions.map((flow) => ({
    value: flow.id,
    label: flow.name,
  }))

  const onSubmit = form.handleSubmit(
    (values) => execute(toRequest(values)),
    showInvalidToast,
  )

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
            <ComboboxField
              emptyText={tCommon("actions.noRecordFound")}
              name="checkoutFlowId"
              options={flowSelectOptions}
              placeholder={t("checkoutFlowId.placeholder")}
              searchPlaceholder={tCommon("actions.search")}
            />
          </SettingRow>
        ) : null}
        <SettingRow
          description={t("orderConfirmationMode.description")}
          label={t("orderConfirmationMode.label")}
        >
          <SelectField
            name="orderConfirmationMode"
            options={orderConfirmationModes.options.map((mode) => ({
              value: mode,
              label: t(`orderConfirmationMode.options.${mode}`),
            }))}
          />
        </SettingRow>
        {orderConfirmationMode === "flow" ? (
          <SettingRow
            description={t("orderConfirmationFlowId.description")}
            label={t("orderConfirmationFlowId.label")}
          >
            <ComboboxField
              emptyText={tCommon("actions.noRecordFound")}
              name="orderConfirmationFlowId"
              options={flowSelectOptions}
              placeholder={t("checkoutFlowId.placeholder")}
              searchPlaceholder={tCommon("actions.search")}
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
