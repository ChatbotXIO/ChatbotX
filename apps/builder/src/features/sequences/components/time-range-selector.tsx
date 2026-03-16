"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import { Label } from "@aha.chat/ui/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { memo, useRef, useState } from "react"
import { toast } from "sonner"

const WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]

const HOURS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0"),
)

type TimeRangeSelectorProps = {
  stepId?: string
  timeOption: "anytime" | "between"
  startTime: string
  endTime: string
  selectedDays: string[]
  onTimeOptionChange: (option: "anytime" | "between") => void
  onStartTimeChange: (time: string) => void
  onEndTimeChange: (time: string) => void
  onSelectedDaysChange: (days: string[]) => void
}

const sortDays = (days: string[]) =>
  [...days].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))

export const TimeRangeSelector = memo(function TimeRangeSelector({
  stepId,
  timeOption,
  startTime,
  endTime,
  selectedDays,
  onTimeOptionChange,
  onStartTimeChange,
  onEndTimeChange,
  onSelectedDaysChange,
}: TimeRangeSelectorProps) {
  const t = useTranslations()
  const [isDayPopoverOpen, setIsDayPopoverOpen] = useState(false)
  const initialSendDaysRef = useRef<string[]>(selectedDays)

  const handleStartTimeChange = (value: string) => {
    if (value >= endTime) {
      toast.error(t("sequences.invalidTimeRange"))
      return
    }
    onStartTimeChange(value)
  }

  const handleEndTimeChange = (value: string) => {
    if (startTime >= value) {
      toast.error(t("sequences.invalidTimeRange"))
      return
    }
    onEndTimeChange(value)
  }

  const handleDayToggle = (day: string, checked: boolean) => {
    const newDays = checked
      ? [...selectedDays, day]
      : selectedDays.filter((d) => d !== day)
    onSelectedDaysChange(sortDays(newDays))
  }

  const handleToggleAllDays = () => {
    const newDays = selectedDays.length === 7 ? [] : [...WEEKDAY_ORDER]
    onSelectedDaysChange(newDays)
    setIsDayPopoverOpen(false)
  }

  const handlePopoverClose = (open: boolean) => {
    if (open) {
      initialSendDaysRef.current = selectedDays
    } else {
      const hasChanged =
        JSON.stringify(initialSendDaysRef.current) !==
        JSON.stringify(selectedDays)
      if (hasChanged) {
        onSelectedDaysChange(sortDays(selectedDays))
      }
    }
    setIsDayPopoverOpen(open)
  }

  const getDaysLabel = () => {
    if (selectedDays.length === WEEKDAY_ORDER.length) {
      return t("sequences.allDays")
    }
    if (selectedDays.length === 0) {
      return t("sequences.selectDays")
    }
    return selectedDays.map((d) => t(`sequences.${d}`)).join(", ")
  }

  return (
    <div className="space-y-3">
      <div className="mb-2 flex items-center space-x-2">
        <Checkbox
          checked={timeOption === "between"}
          id={`time-option-${stepId || "new"}`}
          onCheckedChange={(checked) =>
            onTimeOptionChange(checked ? "between" : "anytime")
          }
        />
        <Label
          className="cursor-pointer font-normal text-sm"
          htmlFor={`time-option-${stepId || "new"}`}
        >
          {t("sequences.setTimeRange")}
        </Label>
      </div>

      {timeOption === "between" && (
        <div className="gap-2">
          <div className="flex items-center gap-2">
            <Select onValueChange={handleStartTimeChange} value={startTime}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((hour) => (
                  <SelectItem key={hour} value={`${hour}:00`}>
                    {hour}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-muted-foreground">-</span>

            <Select onValueChange={handleEndTimeChange} value={endTime}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((hour) => (
                  <SelectItem key={hour} value={`${hour}:00`}>
                    {hour}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 flex items-center">
            <Popover onOpenChange={handlePopoverClose} open={isDayPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  className="w-full justify-start font-normal"
                  variant="outline"
                >
                  {getDaysLabel()}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <div className="space-y-3">
                  <div className="space-y-2">
                    {WEEKDAY_ORDER.map((day) => (
                      <div className="flex items-center space-x-2" key={day}>
                        <Checkbox
                          checked={selectedDays.includes(day)}
                          id={`day-${day}`}
                          onCheckedChange={(checked) =>
                            handleDayToggle(day, !!checked)
                          }
                        />
                        <label
                          className="cursor-pointer font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          htmlFor={`day-${day}`}
                        >
                          {t(`sequences.${day}`)}
                        </label>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleToggleAllDays}
                    variant="outline"
                  >
                    {selectedDays.length === 7
                      ? t("sequences.deselectAll")
                      : t("sequences.allDays")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
    </div>
  )
})
