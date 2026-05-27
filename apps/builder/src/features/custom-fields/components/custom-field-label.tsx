"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

const TYPE_LABEL_KEY: Record<CustomFieldType, string> = {
  shortText: "fields.shortText.label",
  longText: "fields.longText.label",
  number: "fields.number.label",
  date: "fields.date.label",
  datetime: "fields.datetime.label",
  time: "fields.time.label",
  url: "fields.url.label",
  list: "fields.list.label",
  boolean: "fields.boolean.label",
  email: "fields.email.label",
  phoneNumber: "fields.phoneNumber.label",
}

const getTranslationKey = (type: CustomFieldType): string =>
  TYPE_LABEL_KEY[type] ?? "fields.shortText.label"

export default function CustomFieldTypeLabel({
  type,
}: {
  type: CustomFieldType
}) {
  const t = useTranslations()
  const label = useMemo(() => t(getTranslationKey(type)), [t, type])

  return <div>{label}</div>
}
