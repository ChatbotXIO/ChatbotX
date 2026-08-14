"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

type CapiEventFieldsProps = {
  parentName: string
}

export const CapiEventFields = ({ parentName }: CapiEventFieldsProps) => {
  const t = useTranslations()

  const eventTypeOptions = useMemo(
    () => [
      {
        value: "LeadSubmitted",
        label: t("metaConversions.fields.eventType.leadSubmitted"),
      },
    ],
    [t],
  )

  return (
    <div className="mt-2 flex flex-col gap-4">
      <SelectField
        label={t("metaConversions.fields.eventType.label")}
        name={`${parentName}.eventName`}
        options={eventTypeOptions}
        required
      />
      <InputField
        label={t("metaConversions.fields.contentCategory")}
        maxLength={200}
        name={`${parentName}.contentCategory`}
        placeholder={t("metaConversions.fields.contentCategoryPlaceholder")}
      />
      <InputField
        label={t("metaConversions.fields.contentName")}
        maxLength={200}
        name={`${parentName}.contentName`}
        placeholder={t("metaConversions.fields.contentNamePlaceholder")}
      />
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
    </div>
  )
}
