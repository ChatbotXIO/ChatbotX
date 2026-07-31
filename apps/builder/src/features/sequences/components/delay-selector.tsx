"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
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

  const delayUnitItems: { label: string; value: DelayUnit }[] = [
    { label: t("sequences.delayUnits.immediate"), value: "immediate" },
    { label: t("sequences.delayUnits.minutes"), value: "minutes" },
    { label: t("sequences.delayUnits.hours"), value: "hours" },
    { label: t("sequences.delayUnits.days"), value: "days" },
    { label: t("sequences.delayUnits.specificTime"), value: "specificTime" },
  ]

  return (
    <div className="flex w-70 items-center gap-2">
      <span className="ms-2 me-2 whitespace-nowrap text-muted-foreground text-sm">
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
            items={delayUnitItems}
            onValueChange={(value) => onDelayUnitChange(value as DelayUnit)}
            value={delayUnit}
          >
            <SelectTrigger className="w-35">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {delayUnitItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
})
