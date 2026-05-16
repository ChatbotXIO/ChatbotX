"use client"

import {
  waitStepDateTypes,
  waitStepOffsetOperators,
} from "@chatbotx.io/flow-config"
import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import DateTypeSelect from "./date-type-select"
import DelayUnitSelect from "./delay-unit-select"

type DateDelayEditorProps = {
  parentName: string
}

export function DateDelayEditor({ parentName }: DateDelayEditorProps) {
  const t = useTranslations()
  const { register, setValue } = useFormContext()

  const dateType = useWatch({ name: `${parentName}.dateType` })
  const offset = useWatch({ name: `${parentName}.offset` })
  const offsetOperator = useWatch({ name: `${parentName}.offsetOperator` })
  const offsetValue = useWatch({ name: `${parentName}.offsetValue` })
  const offsetUnit = useWatch({ name: `${parentName}.offsetUnit` })

  useEffect(() => {
    if (dateType == null) {
      setValue(`${parentName}.dateType`, waitStepDateTypes.enum.specific)
    }
  }, [dateType, parentName, setValue])

  useEffect(() => {
    if (offset) {
      if (offsetOperator == null) {
        setValue(
          `${parentName}.offsetOperator`,
          waitStepOffsetOperators.enum.add,
        )
      }
      if (offsetValue == null) {
        setValue(`${parentName}.offsetValue`, 1)
      }
      if (offsetUnit == null) {
        setValue(`${parentName}.offsetUnit`, "minutes")
      }
    }
  }, [offset, offsetOperator, offsetValue, offsetUnit, parentName, setValue])

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">
          {t("flows.wait.dateTypeLabel")}
        </Label>
        <DateTypeSelect name={`${parentName}.dateType`} />
      </div>

      {dateType === waitStepDateTypes.enum.specific && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground text-xs">
              {t("flows.wait.datetimeLabel")}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="text-muted-foreground" size={14} />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("flows.wait.datetimeTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <DateTimePickerField
            dateTimeFormat="yyyy-MM-dd HH:mm:ss"
            name={`${parentName}.datetime`}
            saveFormat="iso"
          />
        </div>
      )}

      {dateType === waitStepDateTypes.enum.dynamic && (
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">
              {t("flows.wait.customFieldLabel")}
            </Label>
            <CustomFieldSelect
              customFieldTypes={["datetime"]}
              label=""
              name={`${parentName}.outputFieldId`}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${parentName}.offset`}
                {...register(`${parentName}.offset`)}
                checked={offset}
                onCheckedChange={(checked) =>
                  setValue(`${parentName}.offset`, checked as boolean)
                }
              />
              <Label
                className="cursor-pointer text-sm"
                htmlFor={`${parentName}.offset`}
              >
                {t("flows.wait.offset")}
              </Label>
            </div>

            {offset && (
              <div className="bg-muted/30">
                <Label className="mb-2 block text-muted-foreground text-xs">
                  {t("flows.wait.offsetLabel")}
                </Label>
                <div className="flex items-center gap-2">
                  <div className="w-16 shrink-0">
                    <SelectField
                      name={`${parentName}.offsetOperator`}
                      options={[
                        {
                          value: waitStepOffsetOperators.enum.add,
                          label: t("flows.wait.offsetAdd"),
                        },
                        {
                          value: waitStepOffsetOperators.enum.subtract,
                          label: t("flows.wait.offsetSubtract"),
                        },
                      ]}
                    />
                  </div>
                  <InputNumberField
                    className="w-20"
                    name={`${parentName}.offsetValue`}
                  />
                  <DelayUnitSelect name={`${parentName}.offsetUnit`} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
