"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"

type KeyValueFieldArrayProps = {
  name: string
  keyPlaceholder: string
  valuePlaceholder: string
}

export const KeyValueFieldArray = ({
  name,
  keyPlaceholder,
  valuePlaceholder,
}: KeyValueFieldArrayProps) => {
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({ control, name })

  return (
    <div className="flex w-full flex-col gap-y-2">
      {fields.map((field, index) => (
        <div className="flex w-full gap-x-2" key={field.id}>
          <div className="w-[45%]">
            <InputField
              name={`${name}.${index}.key`}
              placeholder={keyPlaceholder}
            />
          </div>
          <div className="w-[45%]">
            <InputField
              name={`${name}.${index}.value`}
              placeholder={valuePlaceholder}
            />
          </div>
          <Button
            className="text-destructive text-sm"
            onClick={() => remove(index)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        className="w-full"
        onClick={() => append({ key: "", value: "" })}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("actions.add")}
      </Button>
    </div>
  )
}
