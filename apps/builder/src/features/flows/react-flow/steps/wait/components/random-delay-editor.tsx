"use client"

import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import DelayUnitSelect from "./delay-unit-select"

type RandomDelayEditorProps = {
  parentName: string
}

export function RandomDelayEditor({ parentName }: RandomDelayEditorProps) {
  const t = useTranslations()
  const { setValue } = useFormContext()

  const min = useWatch({ name: `${parentName}.min` })
  const max = useWatch({ name: `${parentName}.max` })

  useEffect(() => {
    if (min == null) {
      setValue(`${parentName}.min`, 1)
    }
    if (max == null) {
      setValue(`${parentName}.max`, 10)
    }
  }, [min, max, parentName, setValue])

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">
          {t("flows.wait.randomRangeLabel")}
        </Label>
        <div className="flex items-start gap-2">
          <div className="flex-1 space-y-1">
            <InputNumberField name={`${parentName}.min`} />
          </div>
          <div className="flex-1 space-y-1">
            <InputNumberField name={`${parentName}.max`} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">
          {t("flows.wait.unitLabel")}
        </Label>
        <DelayUnitSelect name={`${parentName}.unit`} />
      </div>
    </div>
  )
}
