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
import { memo, useEffect, useState } from "react"

import {
  DELAY_UNITS,
  type DelayUnit,
  isDelayUnit,
  isDelayValueInRange,
  MAX_DELAY_VALUE,
  MIN_DELAY_VALUE,
  oneHourFromNowLocal,
} from "../lib/delay"

type DelaySelectorProps = {
  delayUnit: DelayUnit
  delayValue: number
  specificDateTime: string
  isSaving: boolean
  onDelayUnitChange: (unit: DelayUnit) => void
  onDelayValueChange: (value: number) => void
  onSpecificDateTimeChange: (dateTime: string) => void
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

  useEffect(() => {
    setLocalValue(delayValue)
    setShowDelayValueError(false)
  }, [delayValue])

  const delayUnitItems = DELAY_UNITS.map((unit) => ({
    label: t(`sequences.delayUnits.${unit}`),
    value: unit,
  }))

  /** Validates the typed number and saves it when it differs from the committed value. Returns whether it was valid. */
  const commitLocalValue = (): boolean => {
    const isValid = isDelayValueInRange(localValue)
    setShowDelayValueError(!isValid)

    if (isValid && localValue !== delayValue) {
      onDelayValueChange(localValue)
    }

    return isValid
  }

  return (
    <div className="flex w-70 items-center gap-2">
      <span className="ms-2 me-2 whitespace-nowrap text-muted-foreground text-sm">
        {t("sequences.afterText")}
      </span>
      {delayUnit === "specificTime" ? (
        <div className="flex w-full items-center gap-1">
          <Input
            disabled={isSaving}
            min={oneHourFromNowLocal()}
            onChange={(e) => onSpecificDateTimeChange(e.target.value)}
            type="datetime-local"
            value={specificDateTime}
          />
          <Button
            className="h-7 w-7 hover:bg-muted hover:text-primary"
            disabled={isSaving}
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
              max={MAX_DELAY_VALUE}
              min={MIN_DELAY_VALUE}
              onBlur={() => {
                if (!commitLocalValue()) {
                  setLocalValue(delayValue)
                }
              }}
              onChange={(e) => {
                const value = Number(e.target.value)
                setLocalValue(value)
                setShowDelayValueError(!isDelayValueInRange(value))
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitLocalValue()
                }
              }}
              step={1}
              type="number"
              value={localValue}
            />
          )}
          <Select
            disabled={isSaving}
            items={delayUnitItems}
            onValueChange={(value) => {
              if (isDelayUnit(value)) {
                onDelayUnitChange(value)
              }
            }}
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
