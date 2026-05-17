"use client"

import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"
import type { ContactFilterCondition } from "../schemas/contact-filter"
import { ContactFilterConditionForm } from "./contact-filter-condition-form"
import { ContactFilterConditionRow } from "./contact-filter-condition-row"
import { useContactFilterConfigs } from "./use-contact-filter-configs"

type ContactFilterProps = {
  parentName: string
}

export const ContactFilter = ({ parentName }: ContactFilterProps) => {
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${parentName}.conditions`,
  })

  const { configs, operatorLabelByValue } = useContactFilterConfigs()

  const handleAdd = (data: ContactFilterCondition) => {
    append(data)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t("fields.contactFilter.label")}</Label>

      <RadioGroupField
        name={`${parentName}.operator`}
        options={[
          {
            label: t("fields.matchAll.label"),
            value: "and",
          },
          {
            label: t("fields.matchAny.label"),
            value: "or",
          },
        ]}
      />

      {fields.map((field, index) => (
        <ContactFilterConditionRow
          configs={configs}
          key={field.id}
          onRemove={() => remove(index)}
          operatorLabelByValue={operatorLabelByValue}
          row={field as unknown as ContactFilterCondition}
        />
      ))}

      <ContactFilterConditionForm onAdd={handleAdd} />
    </div>
  )
}
