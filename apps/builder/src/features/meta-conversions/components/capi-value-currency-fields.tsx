"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { useTranslations } from "next-intl"

type CapiValueCurrencyFieldsProps = {
  parentName: string
}

/**
 * Value/currency `InputField` pair used by `CapiEventFields`
 * (`capi-event-fields.tsx`) to let a user set a STATIC CAPI value/currency
 * on an event.
 */
export const CapiValueCurrencyFields = ({
  parentName,
}: CapiValueCurrencyFieldsProps) => {
  const t = useTranslations()

  return (
    <>
      <InputField
        inputMode="decimal"
        label={t("metaConversions.fields.value")}
        name={`${parentName}.value`}
        placeholder={t("metaConversions.fields.valuePlaceholder")}
      />
      <InputField
        label={t("metaConversions.fields.currency")}
        maxLength={3}
        name={`${parentName}.currency`}
        placeholder={t("metaConversions.fields.currencyPlaceholder")}
        style={{ textTransform: "uppercase" }}
      />
    </>
  )
}
