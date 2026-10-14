"use client"

import { INBOUND_WEBHOOK_LIMITS } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import type { InboundWebhookFormValues } from "../lib/webhook-form"
import { JsonPathField } from "./json-path-field"

/** The system fields a payload value may be written to besides custom fields. */
const MAPPABLE_SYSTEM_FIELDS = [
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "gender",
] as const

export const FieldMappingsSection = ({ sample }: { sample: unknown }) => {
  const t = useTranslations("inboundWebhooks")
  const { control } = useFormContext<InboundWebhookFormValues>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "fieldMappings",
  })
  const targetOptions = useCustomFieldSelectOptions({
    includeReserved: true,
    reservedFieldIds: [...MAPPABLE_SYSTEM_FIELDS],
  })

  return (
    <div className="flex flex-col gap-4">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("mappings.empty")}</p>
      ) : null}
      {fields.map((field, index) => (
        <div
          className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start"
          key={field.id}
        >
          <div className="flex-1">
            <ComboboxField
              label={t("mappings.target")}
              name={`fieldMappings.${index}.target`}
              options={targetOptions}
              placeholder={t("mappings.targetPlaceholder")}
              required
            />
          </div>
          <div className="flex-1">
            <JsonPathField
              label={t("mappings.path")}
              name={`fieldMappings.${index}.jsonPath`}
              pickerTitle={t("mappings.rowTitle", { number: index + 1 })}
              required
              sample={sample}
            />
          </div>
          <Button
            aria-label={t("mappings.remove")}
            className="sm:mt-6"
            // The last row stays: a saved webhook needs at least one mapping.
            disabled={fields.length <= 1}
            onClick={() => remove(index)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2Icon aria-hidden className="size-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          disabled={fields.length >= INBOUND_WEBHOOK_LIMITS.maxFieldMappings}
          onClick={() => append({ jsonPath: "", target: "" })}
          type="button"
          variant="outline"
        >
          <PlusIcon aria-hidden className="size-4" />
          {t("mappings.add")}
        </Button>
      </div>
    </div>
  )
}
