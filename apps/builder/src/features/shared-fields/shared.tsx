import type { CustomFieldType } from "@aha.chat/database/types"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

type TranslationFunction = ReturnType<typeof useTranslations>

type CustomFieldTypeLabel = {
  value: CustomFieldType
  label: string
}

export const getCustomFieldTypeLabels = (
  t: TranslationFunction,
): CustomFieldTypeLabel[] => [
  {
    value: "shortText",
    label: t("fields.shortText.label"),
  },
  {
    value: "number",
    label: t("fields.number.label"),
  },
  {
    value: "date",
    label: t("fields.date.label"),
  },
  {
    value: "datetime",
    label: t("fields.datetime.label"),
  },
  {
    value: "boolean",
    label: t("fields.boolean.label"),
  },
  {
    value: "longText",
    label: t("fields.longText.label"),
  },
]

export const useCustomFieldTypeLabels = (): CustomFieldTypeLabel[] => {
  const t = useTranslations()

  return useMemo(() => getCustomFieldTypeLabels(t), [t])
}
