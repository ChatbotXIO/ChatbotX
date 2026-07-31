"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

const translationKeyByCustomFieldType = {
  shortText: "fields.shortText.label",
  email: "fields.email.label",
  phoneNumber: "fields.phoneNumber.label",
  number: "fields.number.label",
  date: "fields.date.label",
  datetime: "fields.datetime.label",
  boolean: "fields.boolean.label",
  longText: "fields.longText.label",
} as const satisfies Record<CustomFieldType, string>

export default function CustomFieldTypeLabel({
  type,
}: {
  type: CustomFieldType
}) {
  const t = useTranslations()
  const label = useMemo(
    () => t(translationKeyByCustomFieldType[type]),
    [t, type],
  )

  return <div>{label}</div>
}
