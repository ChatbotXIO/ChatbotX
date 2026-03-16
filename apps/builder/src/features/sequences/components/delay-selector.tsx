"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Input } from "@aha.chat/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { RotateCcwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo, useState } from "react"

type DelayUnit = "immediate" | "minutes" | "hours" | "days" | "specificTime"

type DelaySelectorProps = {
  delayUnit: DelayUnit
  delayValue: number
  specificDateTime: string
  isSaving: boolean
  onDelayUnitChange: (unit: DelayUnit) => void
  onDelayValueChange: (value: number) => void
  onSpecificDateTimeChange: (dateTime: string) => void
}

function getOneHourFromNowLocal() {
  const now = new Date()
  now.setHours(now.getHours() + 1)
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, "0")
  const day = `${now.getDate()}`.padStart(2, "0")
  const hour = `${now.getHours()}`.padStart(2, "0")
  const minute = `${now.getMinutes()}`.padStart(2, "0")
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export const DelaySelector = memo(function DelaySelector({
  delayUnit,
  delayValue,
  specificDateTime,
  isSaving,
  onDelayUnitChange,
  onDelayValueChange,
  onSpecificDateTimeChange,
}: DelaySelectorProps) {
  const t = useTranslations()
  const [showDelayValueError, setShowDelayValueError] = useState(false)
  const [localValue, setLocalValue] = useState(delayValue)

  return (
    <div className="flex w-[280px] items-center gap-2">
      <span className="mr-2 ml-2 whitespace-nowrap text-muted-foreground text-sm">
        {t("sequences.afterText")}
      </span>
      {delayUnit === "specificTime" ? (
        <div className="flex w-full items-center gap-1">
          <Input
            disabled={isSaving}
            min={getOneHourFromNowLocal()}
            onBlur={() => {
              if (specificDateTime) {
                onSpecificDateTimeChange(specificDateTime)
              }
            }}
            onChange={(e) => onSpecificDateTimeChange(e.target.value)}
            type="datetime-local"
            value={specificDateTime}
          />
          <Button
            className="h-7 w-7 hover:bg-muted hover:text-primary"
            onClick={() => onDelayUnitChange("days")}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RotateCcwIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex w-full gap-2">
          {delayUnit !== "immediate" && (
            <Input
              className={`w-20 ${showDelayValueError ? "border-destructive" : ""}`}
              disabled={isSaving}
              max={99_999}
              min={1}
              onBlur={() => {
                if (!localValue || localValue < 1 || localValue > 99_999) {
                  setShowDelayValueError(true)
                  setLocalValue(delayValue)
                  return
                }
                setShowDelayValueError(false)
                onDelayValueChange(localValue)
              }}
              onChange={(e) => {
                const value = Number(e.target.value)
                setLocalValue(value)
                if (value >= 1 && value <= 99_999) {
                  setShowDelayValueError(false)
                } else {
                  setShowDelayValueError(true)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (!localValue || localValue < 1 || localValue > 99_999) {
                    setShowDelayValueError(true)
                    return
                  }
                  setShowDelayValueError(false)
                  onDelayValueChange(localValue)
                }
              }}
              type="number"
              value={localValue}
            />
          )}
          <Select
            disabled={isSaving}
            onValueChange={(value) => onDelayUnitChange(value as DelayUnit)}
            value={delayUnit}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">
                {t("sequences.delayUnits.immediate")}
              </SelectItem>
              <SelectItem value="minutes">
                {t("sequences.delayUnits.minutes")}
              </SelectItem>
              <SelectItem value="hours">
                {t("sequences.delayUnits.hours")}
              </SelectItem>
              <SelectItem value="days">
                {t("sequences.delayUnits.days")}
              </SelectItem>
              <SelectItem value="specificTime">
                {t("sequences.delayUnits.specificTime")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
})
