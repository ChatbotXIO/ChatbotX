"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const

/** The select hands back strings, so the form keeps the day as one. */
export type OpenHoursFormRow = { day: string; from: string; to: string }

/** Rows of day + opening and closing time, in the workspace timezone. */
export function OpenHoursEditor({ disabled }: { disabled?: boolean }) {
  const t = useTranslations("openHours")
  const { control } = useFormContext<{ openHours: OpenHoursFormRow[] }>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "openHours",
  })
  const dayOptions = DAYS.map((day) => ({
    value: String(day),
    label: t(`days.${day}`),
  }))

  return (
    <div className="space-y-2">
      {fields.map((field, index) => (
        <div className="flex items-end gap-2" key={field.id}>
          <SelectField
            disabled={disabled}
            formItemClassName="flex-1"
            label={index === 0 ? t("day") : undefined}
            name={`openHours.${index}.day`}
            options={dayOptions}
          />
          <InputField
            disabled={disabled}
            formItemClassName="w-32"
            label={index === 0 ? t("from") : undefined}
            name={`openHours.${index}.from`}
            type="time"
          />
          <InputField
            disabled={disabled}
            formItemClassName="w-32"
            label={index === 0 ? t("to") : undefined}
            name={`openHours.${index}.to`}
            type="time"
          />
          <Button
            aria-label={t("remove")}
            disabled={disabled}
            onClick={() => remove(index)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button
        disabled={disabled}
        onClick={() => append({ day: "1", from: "09:00", to: "17:00" })}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusIcon />
        {t("add")}
      </Button>
    </div>
  )
}
