"use client"

import { CustomFieldType } from "@aha.chat/database/types"
import { DelayType } from "@aha.chat/flow-config"
import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import { DateTimePicker } from "@aha.chat/ui/components/ui/date-picker"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { T, useTranslate } from "@tolgee/react"
import { parseISO } from "date-fns"
import { InfoIcon } from "lucide-react"
import { useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { DelayTypeSelect } from "@/features/flows/react-flow/steps/wait/delay-type-select"
import { DelayUnitSelect } from "@/features/flows/react-flow/steps/wait/delay-unit-select"
import { TimeSelect } from "@/features/flows/react-flow/steps/wait/time-select"

type WaitStepEditorProps = {
  parentName: string
}

export const WaitStepEditor = (props: WaitStepEditorProps) => {
  const { parentName } = props

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
              className="min-w-[50px] px-1"
              name={`${parentName}.duration`}
            />
            <DelayUnitSelect name={`${parentName}.unit`} />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`${parentName}.repeat`}
              {...register(`${parentName}.repeat`)}
              defaultChecked={repeat}
              onCheckedChange={(checked) =>
                setValue(`${parentName}.repeat`, checked)
              }
            />
            <label
              className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              htmlFor={`${parentName}.repeat`}
            >
              {t("flows.Wait.setInterval")}
            </label>
          </div>
          {repeat && (
            <div className="flex items-center justify-between gap-2">
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
            displayFormat={{ hour24: "yyyy-MM-dd HH:mm" }}
            granularity="minute"
            onChange={(value) => {
              setValue(`${parentName}.datetime`, value)
            }}
            value={
              typeof datetime === "string"
                ? parseISO(datetime)
                : (datetime ?? new Date())
            }
          />
        </>
      )}
      {delayType === DelayType.DatetimeCustomField && (
        <CustomFieldSelect
          customFieldType={CustomFieldType.DATETIME}
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
        />
      )}
    </div>
  )
}
