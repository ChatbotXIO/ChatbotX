"use client"

import { InputNumberField } from "@/components/form/input-number-field"
import { Checkbox } from "@/components/ui/checkbox"
import { DateTimePicker } from "@/components/ui/date-picker"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { DelayTypeSelect } from "@/features/flows/react-flow/steps/wait/delay-type-select"
import { DelayUnitSelect } from "@/features/flows/react-flow/steps/wait/delay-unit-select"
import { DelayType } from "@/features/flows/react-flow/steps/wait/schema"
import { TimeSelect } from "@/features/flows/react-flow/steps/wait/time-select"
import { CustomFieldType } from "@ahachat.ai/database/types"
import { T, useTranslate } from "@tolgee/react"
import { parseISO } from "date-fns"
import { InfoIcon } from "lucide-react"
import { useFormContext } from "react-hook-form"

export const WaitStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const { t } = useTranslate()
  const { register, watch, setValue } = useFormContext()

  const [delayType, repeat, datetime] = watch([
    `${parentName}.delayType`,
    `${parentName}.repeat`,
    `${parentName}.datetime`,
  ])

  return (
    <div className="flex flex-col gap-3">
      <DelayTypeSelect name={`${parentName}.delayType`} />
      {delayType === DelayType.Duration && (
        <>
          <div className="flex justify-between gap-2">
            <InputNumberField
              name={`${parentName}.duration`}
              className="min-w-[50px] px-1"
            />
            <DelayUnitSelect name={`${parentName}.unit`} />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`${parentName}.repeat`}
              {...register(`${parentName}.repeat`)}
              onCheckedChange={(checked) =>
                setValue(`${parentName}.repeat`, checked)
              }
              defaultChecked={repeat}
            />
            <label
              htmlFor={`${parentName}.repeat`}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t("flows.Wait.setInterval")}
            </label>
          </div>
          {repeat && (
            <div className="flex justify-between gap-2 items-center">
              <TimeSelect name={`${parentName}.startTime`} />
              ~
              <TimeSelect name={`${parentName}.endTime`} />
            </div>
          )}
        </>
      )}
      {delayType === DelayType.SpecificDate && (
        <>
          <div className="flex items-center gap-2">
            {t("common.selectDate")}
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon size={18} />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("flows.Wait.Datetime.tooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <DateTimePicker
            granularity="minute"
            displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
            value={
              typeof datetime === "string"
                ? parseISO(datetime)
                : (datetime ?? new Date())
            }
            onChange={(value) => {
              setValue(`${parentName}.datetime`, value)
            }}
          />
        </>
      )}
      {delayType === DelayType.DatetimeCustomField && (
        <CustomFieldSelect
          label={
            <>
              <T keyName="flows.Wait.DateTimeCustomField" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon size={18} />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("flows.Wait.Datetime.tooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </>
          }
          name={`${parentName}.customFieldId`}
          customFieldType={CustomFieldType.DATETIME}
        />
      )}
    </div>
  )
}
