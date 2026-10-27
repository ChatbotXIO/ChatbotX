"use client"

import {
  currencyPositions,
  type EcommercePaymentSettings,
  isOnlinePaymentMethod,
  type OnlinePaymentProvider,
  paymentMethods,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { TriangleAlertIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { PERCENT_INPUT_PROPS } from "@/features/products/constants"
import { useCurrencyOptions } from "@/hooks/use-currency-options"
import { useInvalidFormToast } from "@/lib/validation/use-request-resolver"
import type { EcommerceSettingsPublicResource } from "../schema/public"
import { SettingRow, SettingsSaveBar } from "./setting-row"
import { useSettingsResolver } from "./use-settings-resolver"
import { useSettingsSave } from "./use-settings-save"

type PaymentFormValues = Omit<EcommercePaymentSettings, "currencySymbol"> & {
  currencySymbol: string
}

const toRequest = (values: PaymentFormValues) => ({
  payments: {
    ...values,
    currencySymbol: values.currencySymbol || null,
    // An emptied number field means no fee.
    serviceFeePercent: Number(values.serviceFeePercent) || 0,
  },
})

export function PaymentSettingsForm({
  workspaceId,
  settings,
  connectedProviders,
}: {
  workspaceId: string
  settings: EcommerceSettingsPublicResource
  /** Stripe / PayPal connected in Settings → Integrations. */
  connectedProviders: OnlinePaymentProvider[]
}) {
  const t = useTranslations("ecommerceSettings.payments")
  const { execute, isPending } = useSettingsSave(workspaceId)
  const currencyOptions = useCurrencyOptions(settings.payments.currency)
  const showInvalidToast = useInvalidFormToast()
  const resolver = useSettingsResolver(toRequest)

  const form = useForm<PaymentFormValues>({
    resolver,
    defaultValues: {
      ...settings.payments,
      currencySymbol: settings.payments.currencySymbol ?? "",
    },
  })

  const onSubmit = form.handleSubmit(
    (values) => execute(toRequest(values)),
    showInvalidToast,
  )

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={onSubmit}>
        {settings.productsInOtherCurrency > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            {t("currencyMismatch", {
              count: settings.productsInOtherCurrency,
              currency: settings.payments.currency,
            })}
          </div>
        ) : null}
        <SettingRow
          description={t("paymentMethods.description")}
          label={t("paymentMethods.label")}
        >
          <MultiSelectField
            name="paymentMethods"
            options={paymentMethods.options
              // An online method can be offered once its provider is
              // connected; one still selected stays, so it can be removed.
              .filter(
                (method) =>
                  !isOnlinePaymentMethod(method) ||
                  connectedProviders.includes(method) ||
                  settings.payments.paymentMethods.includes(method),
              )
              .map((method) => ({
                value: method,
                label: t(`paymentMethods.options.${method}`),
              }))}
          />
          {(["stripe", "paypal"] as const)
            .filter((provider) => !connectedProviders.includes(provider))
            .map((provider) => (
              <p className="text-muted-foreground text-sm" key={provider}>
                {t.rich("paymentMethods.connectHint", {
                  provider: t(`paymentMethods.options.${provider}`),
                  link: (chunks) => (
                    <Link
                      className="underline"
                      href={`/space/${workspaceId}/settings/integrations/${provider}`}
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            ))}
        </SettingRow>
        <SettingRow
          description={t("currency.description")}
          label={t("currency.label")}
        >
          <SelectField name="currency" options={currencyOptions} />
        </SettingRow>
        <SettingRow
          description={t("currencyPosition.description")}
          label={t("currencyPosition.label")}
        >
          <SelectField
            name="currencyPosition"
            options={currencyPositions.options.map((position) => ({
              value: position,
              label: t(`currencyPosition.options.${position}`),
            }))}
          />
        </SettingRow>
        <SettingRow
          description={t("currencySymbol.description")}
          label={t("currencySymbol.label")}
        >
          <InputField maxLength={8} name="currencySymbol" />
        </SettingRow>
        <SettingRow
          description={t("serviceFeePercent.description")}
          label={t("serviceFeePercent.label")}
        >
          <InputNumberField name="serviceFeePercent" {...PERCENT_INPUT_PROPS} />
        </SettingRow>
        <SettingsSaveBar isSaving={isPending} />
      </form>
    </Form>
  )
}
