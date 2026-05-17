"use client"

import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import DelayUnitSelect from "./delay-unit-select"
import TimeSelect from "./time-select"

type DurationDelayEditorProps = {
  parentName: string
}

export function DurationDelayEditor({ parentName }: DurationDelayEditorProps) {
  const t = useTranslations()
  const { register, setValue } = useFormContext()
  const interval = useWatch({ name: `${parentName}.interval` })
  const startTime = useWatch({ name: `${parentName}.startTime` })
  const endTime = useWatch({ name: `${parentName}.endTime` })

  useEffect(() => {
    if (interval) {
      if (startTime == null) {
        setValue(`${parentName}.startTime`, "08:00:00")
      }
      if (endTime == null) {
        setValue(`${parentName}.endTime`, "22:00:00")
      }
    }
  }, [interval, startTime, endTime, parentName, setValue])

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">
          {t("flows.wait.durationLabel")}
        </Label>
        <div className="flex gap-2">
          <InputNumberField
            className="min-w-[80px] flex-1"
            name={`${parentName}.duration`}
          />
          <DelayUnitSelect name={`${parentName}.unit`} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${parentName}.interval`}
            {...register(`${parentName}.interval`)}
            checked={interval}
            onCheckedChange={(checked) =>
              setValue(`${parentName}.interval`, checked as boolean)
            }
          />
          <Label
            className="cursor-pointer text-sm"
            htmlFor={`${parentName}.interval`}
          >
            {t("flows.wait.setInterval")}
          </Label>
        </div>

        {interval && (
          <div className="bg-muted/30">
            <div className="flex items-center gap-2">
              <TimeSelect name={`${parentName}.startTime`} />
              <span className="text-muted-foreground">—</span>
              <TimeSelect name={`${parentName}.endTime`} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
