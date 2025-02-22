"use client"

import { SingleSelect } from "@/components/single-select"
import {
  FilterAttribute,
  FilterOperator,
} from "@/features/contacts/filter-type"
import { useTranslate } from "@tolgee/react"
import { useFormContext } from "react-hook-form"

type OptionType = "templateMessage" | "activeContact24h"

export function WhatsappOption({
  name,
  onSelect,
}: { name: string; onSelect: () => void }) {
  const { t } = useTranslate()
  const options = [
    { label: t("common.templateMessage"), value: "templateMessage" },
    {
      label: t("broadcasts.whatsapp.activeContact24h"),
      value: "activeContact24h",
    },
  ]

  const { register, setValue } = useFormContext()

  const onSelectOption = (value: OptionType) => {
    if (value === "activeContact24h") {
      setValue(name, {
        attribute: FilterAttribute.InteractedLast24h,
        operator: FilterOperator.Is,
        value: true,
      })
    }
    onSelect()
  }

  return (
    <SingleSelect
      name="whatsappOption"
      placeholder="Please select"
      options={options}
      onValueChange={(value: OptionType) => onSelectOption(value)}
    />
  )
}
