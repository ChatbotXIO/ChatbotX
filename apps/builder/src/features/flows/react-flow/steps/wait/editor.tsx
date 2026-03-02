"use client"

import { DelayType } from "@aha.chat/flow-config"
import { DateTimePickerField } from "@aha.chat/ui/components/form/date-picker-field"
import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import DelayTypeSelect from "@/features/flows/react-flow/steps/wait/components/delay-type-select"
import DelayUnitSelect from "@/features/flows/react-flow/steps/wait/components/delay-unit-select"
import TimeSelect from "@/features/flows/react-flow/steps/wait/components/time-select"

type WaitStepEditorProps = {
  parentName: string
}

const WaitStepEditor = (props: WaitStepEditorProps) => {
  const { parentName } = props

  const t = useTranslations()
  const { register, setValue } = useFormContext()

  const delayType = useWatch({ name: `${parentName}.delayType` })
  const repeat = useWatch({ name: `${parentName}.repeat` })

  return (
    <div className="flex flex-col gap-3">
      <DelayTypeSelect name={`${parentName}.delayType`} />
      {delayType === DelayType.duration && (
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
              {t("flows.wait.setInterval")}
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
      {delayType === DelayType.specify && (
        <>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon size={18} />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("flows.wait.datetimeTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <DateTimePickerField
            dateTimeFormat="yyyy-MM-dd HH:mm"
            name={`${parentName}.datetime`}
            required
          />
        </>
      )}
      {delayType === DelayType.customField && (
        <CustomFieldSelect
          customFieldTypes={["datetime"]}
          label={t("flows.wait.datetimeTooltip")}
          name={`${parentName}.customFieldId`}
        />
      )}
    </div>
  )
}

export default WaitStepEditor
