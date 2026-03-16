import { useCallback, useState } from "react"
import type { DelayUnit, Step } from "./use-sequence-step"

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

function getInitialDelayUnit(step?: Step): DelayUnit {
  if (!step) {
    return "days"
  }
  if (step.delayUnit === "specificTime") {
    return "specificTime"
  }
  if (step.delayUnit === "immediate") {
    return "immediate"
  }
  if (step.delayDays > 0) {
    return "days"
  }
  if (step.delayMinutes >= 60) {
    return "hours"
  }
  if (step.delayMinutes > 0) {
    return "minutes"
  }
  return "immediate"
}

function getInitialDelayValue(step?: Step): number {
  if (!step) {
    return 1
  }
  if (step.delayDays > 0) {
    return step.delayDays
  }
  if (step.delayMinutes >= 60) {
    return Math.floor(step.delayMinutes / 60)
  }
  if (step.delayMinutes > 0) {
    return step.delayMinutes
  }
  return 1
}

function getInitialSpecificDateTime(step?: Step): string {
  if (step?.specificDateTime) {
    const date = new Date(step.specificDateTime)
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, "0")
    const day = `${date.getDate()}`.padStart(2, "0")
    const hour = `${date.getHours()}`.padStart(2, "0")
    const minute = `${date.getMinutes()}`.padStart(2, "0")
    return `${year}-${month}-${day}T${hour}:${minute}`
  }
  return ""
}

export function useDelayState(
  step: Step | undefined,
  onSave: (fields: {
    delayUnit?: DelayUnit
    delayValue?: number
    specificDateTime?: string
  }) => Promise<void>,
) {
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(() =>
    getInitialDelayUnit(step),
  )
  const [delayValue, setDelayValue] = useState<number>(() =>
    getInitialDelayValue(step),
  )
  const [specificDateTime, setSpecificDateTime] = useState<string>(() =>
    getInitialSpecificDateTime(step),
  )

  const handleDelayUnitChange = useCallback(
    (unit: DelayUnit) => {
      setDelayUnit(unit)

      if (unit === "specificTime") {
        const newDateTime = specificDateTime || getOneHourFromNowLocal()
        setSpecificDateTime(newDateTime)
        onSave({
          delayUnit: unit,
          specificDateTime: newDateTime,
        })
      } else {
        onSave({ delayUnit: unit })
      }
    },
    [specificDateTime, onSave],
  )

  const handleDelayValueChange = useCallback(
    (value: number) => {
      setDelayValue(value)
      onSave({ delayValue: value })
    },
    [onSave],
  )

  const handleSpecificDateTimeChange = useCallback(
    (dateTime: string) => {
      setSpecificDateTime(dateTime)
      if (dateTime) {
        onSave({ specificDateTime: dateTime })
      }
    },
    [onSave],
  )

  return {
    delayUnit,
    delayValue,
    specificDateTime,
    handleDelayUnitChange,
    handleDelayValueChange,
    handleSpecificDateTimeChange,
  }
}
