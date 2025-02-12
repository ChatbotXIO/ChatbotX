"use client"

import { formatDate } from "@/components/data-table/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DelayType,
  DelayUnit,
} from "@/features/flows/react-flow/blocks/wait/schema"
import { cn } from "@/lib/utils"
import type { Field } from "@ahachat.ai/database"
import { T, useTranslate } from "@tolgee/react"
import { CalendarIcon, InfoIcon } from "lucide-react"
import type React from "react"
import { useFormContext } from "react-hook-form"

const TimePicker = ({ ...props }) => {
  const times = []
  for (let hour = 0; hour < 24; hour++) {
    const formattedHour = hour.toString().padStart(2, "0")
    times.push(`${formattedHour}:00`)
  }

  return (
    <Select {...props}>
      <SelectTrigger>
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {times.map((time) => (
            <SelectItem key={time} value={`${time}:00`}>
              {time}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export const WaitBlockEditor = ({
  parentName,
  customFields = [],
}: {
  parentName: string
  customFields: Field[]
}) => {
  const { t } = useTranslate()
  const { register, watch, setValue } = useFormContext()

  const [
    delayType,
    duration,
    unit,
    repeat,
    startTime,
    endTime,
    datetime,
    customFieldId,
  ] = watch([
    `${parentName}.delayType`,
    `${parentName}.duration`,
    `${parentName}.unit`,
    `${parentName}.repeat`,
    `${parentName}.startTime`,
    `${parentName}.endTime`,
    `${parentName}.datetime`,
    `${parentName}.customFieldId`,
  ])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-2">
        <T keyName="flows.Wait.DelayType" />
        <Select
          onValueChange={(value) => setValue(`${parentName}.delayType`, value)}
          {...register(`${parentName}.delayType`)}
          defaultValue={delayType}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {Object.values(DelayType).map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {delayType === DelayType.Duration && (
        <>
          <div className="flex justify-between gap-2">
            <Input
              {...register(`${parentName}.duration`)}
              defaultValue={duration}
            />
            <Select
              onValueChange={(value) => setValue(`${parentName}.unit`, value)}
              {...register(`${parentName}.unit`)}
              defaultValue={unit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.values(DelayUnit).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
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
              <TimePicker
                onValueChange={(value: string) =>
                  setValue(`${parentName}.startTime`, value)
                }
                {...register(`${parentName}.startTime`)}
                defaultValue={startTime}
              />
              ~
              <TimePicker
                onValueChange={(value: string) =>
                  setValue(`${parentName}.endTime`, value)
                }
                {...register(`${parentName}.endTime`)}
                defaultValue={endTime}
              />
            </div>
          )}
        </>
      )}
      {delayType === DelayType.SpecificDate && (
        <>
          <div className="flex items-center gap-1 font-bold">
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id={parentName}
                variant="outline"
                size="sm"
                aria-controls={`${parentName}-calendar`}
                className={cn(
                  "h-8 w-full justify-start gap-2 rounded text-left font-normal",
                  !datetime && "text-muted-foreground",
                )}
              >
                <CalendarIcon
                  className="size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">
                  {datetime ? formatDate(datetime) : "Pick a date"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              id={`${parentName}-calendar`}
              align="start"
              className="w-auto p-0"
            >
              <Calendar
                id={`${parentName}-calendar`}
                mode="single"
                selected={datetime}
                onSelect={(date) => {
                  setValue(`${parentName}.datetime`, date)

                  setTimeout(() => {
                    document.getElementById(parentName)?.click()
                  }, 0)
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </>
      )}
      {delayType === DelayType.DatetimeCustomField && (
        <>
          <div className="flex items-center gap-1 font-bold">
            {t("flows.Wait.DateTimeCustomField")}
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon size={18} />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("flows.Wait.Datetime.tooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Select
            onValueChange={(value) =>
              setValue(`${parentName}.customFieldId`, value)
            }
            {...register(`${parentName}.customFieldId`)}
            defaultValue={customFieldId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a field" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {customFields.map((customField) => (
                  <SelectItem key={customField.id} value={customField.id}>
                    {customField.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  )
}
