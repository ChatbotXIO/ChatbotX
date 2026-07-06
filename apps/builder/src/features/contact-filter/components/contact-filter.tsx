"use client"

import type { ContactFilterField } from "@chatbotx.io/database/partials"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { pruneExcludedConditions } from "../lib/prune-conditions"
import type { ContactFilterCondition } from "../schemas"
import { ContactFilterConditionForm } from "./contact-filter-condition-form"
import { ContactFilterConditionRow } from "./contact-filter-condition-row"
import { useContactFilterConfigs } from "./use-contact-filter-configs"

type ContactFilterProps = {
  parentName: string
  excludeFields?: ContactFilterField[]
  inboxChannel?: string
}

const EMPTY_EXCLUDE_FIELDS: ContactFilterField[] = []

export const ContactFilter = ({
  parentName,
  excludeFields = EMPTY_EXCLUDE_FIELDS,
  inboxChannel,
}: ContactFilterProps) => {
  const t = useTranslations()
  const { control, getValues } = useFormContext()
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: `${parentName}.conditions`,
  })

  const { configs, operatorLabelByValue } =
    useContactFilterConfigs(inboxChannel)

  useEffect(() => {
    const conditions =
      (getValues(`${parentName}.conditions`) as
        | ContactFilterCondition[]
        | undefined) ?? []
    const pruned = pruneExcludedConditions(conditions, excludeFields)

    if (pruned.length !== conditions.length) {
      replace(pruned)
    }
  }, [excludeFields, getValues, parentName, replace])

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

      <ContactFilterConditionForm
        excludeFields={excludeFields}
        inboxChannel={inboxChannel}
        onAdd={handleAdd}
      />
    </div>
  )
}
