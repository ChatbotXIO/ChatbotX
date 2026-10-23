"use client"

import {
  type EcommerceShippingSettings,
  shippingModes,
} from "@chatbotx.io/database/partials"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { PRICE_INPUT_PROPS } from "@/features/products/constants"
import {
  type FieldRule,
  useInvalidFormToast,
} from "@/lib/validation/use-request-resolver"
import { useCountryOptions } from "../lib/use-country-options"
import type { EcommerceSettingsPublicResource } from "../schema/public"
import { SettingRow, SettingsSaveBar } from "./setting-row"
import { useSettingsResolver } from "./use-settings-resolver"
import { useSettingsSave } from "./use-settings-save"

type ShippingFormValues = Omit<
  EcommerceShippingSettings,
  "storeAddress" | "defaultShippingCountry"
> & {
  storeAddress: string
  defaultShippingCountry: string | undefined
}

const toRequest = (values: ShippingFormValues) => ({
  shipping: {
    ...values,
    // An emptied number field means free delivery.
    deliveryCost: Number(values.deliveryCost) || 0,
    storeAddress: values.storeAddress.trim() || null,
    defaultShippingCountry: values.defaultShippingCountry || null,
  },
})

/** Every region libphonenumber knows, named in the viewer's language. */
export function ShippingSettingsForm({
  workspaceId,
  settings,
}: {
  workspaceId: string
  settings: EcommerceSettingsPublicResource
}) {
  const t = useTranslations("ecommerceSettings.shipping")
  const tValidation = useTranslations("validation.form")
  const { execute, isPending } = useSettingsSave(workspaceId)
  const showInvalidToast = useInvalidFormToast()
  const countryOptions = useCountryOptions()
  /** The service's checks: pickup needs an address, the default a listed country. */
  const rules = (
    values: ShippingFormValues,
  ): Array<FieldRule<ShippingFormValues> | false> => [
    (values.shippingType === "pickup" ||
      values.shippingType === "deliveryAndPickup") &&
      !values.storeAddress.trim() && {
        field: "storeAddress",
        message: tValidation("required"),
      },
    Boolean(values.defaultShippingCountry) &&
      values.shippingCountries.length > 0 &&
      !values.shippingCountries.includes(
        values.defaultShippingCountry ?? "",
      ) && {
        field: "defaultShippingCountry",
        message: t("defaultCountryNotShipped"),
      },
  ]
  const resolver = useSettingsResolver(toRequest, rules)

  const form = useForm<ShippingFormValues>({
    resolver,
    defaultValues: {
      ...settings.shipping,
      storeAddress: settings.shipping.storeAddress ?? "",
      defaultShippingCountry:
        settings.shipping.defaultShippingCountry ?? undefined,
    },
  })
  const shippingCountries = form.watch("shippingCountries")
  const defaultCountryOptions = countryOptions.filter(
    (option) =>
      shippingCountries.length === 0 ||
      shippingCountries.includes(option.value),
  )

  const onSubmit = form.handleSubmit(
    (values) => execute(toRequest(values)),
    showInvalidToast,
  )

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <SettingRow
          description={t("shippingType.description")}
          label={t("shippingType.label")}
        >
          <SelectField
            name="shippingType"
            options={shippingModes.options.map((mode) => ({
              value: mode,
              label: t(`shippingType.options.${mode}`),
            }))}
          />
        </SettingRow>
        <SettingRow
          description={t("storeAddress.description")}
          label={t("storeAddress.label")}
        >
          <TextareaField name="storeAddress" />
        </SettingRow>
        <SettingRow
          description={t("shippingCountries.description")}
          label={t("shippingCountries.label")}
        >
          <MultiSelectField name="shippingCountries" options={countryOptions} />
        </SettingRow>
        <SettingRow
          description={t("defaultShippingCountry.description")}
          label={t("defaultShippingCountry.label")}
        >
          <SelectField
            allowClear
            clearLabel={t("defaultShippingCountry.none")}
            name="defaultShippingCountry"
            options={defaultCountryOptions}
          />
        </SettingRow>
        <SettingRow
          description={t("deliveryCost.description")}
          label={t("deliveryCost.label")}
        >
          <InputNumberField
            min={0}
            name="deliveryCost"
            {...PRICE_INPUT_PROPS}
          />
        </SettingRow>
        <SettingsSaveBar isSaving={isPending} />
      </form>
    </Form>
  )
}
