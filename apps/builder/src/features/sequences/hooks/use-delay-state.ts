import { useCallback, useEffect, useState } from "react"
import {
  type DelayUnit,
  type DelayView,
  oneHourFromNowLocal,
  type StoredDelayFields,
  stepToDelayView,
} from "../lib/delay"
import type { Step } from "./use-sequence-step"

type OnSave = (fields: {
  delay: { unit: DelayUnit; value: number; specificDateTime?: string }
}) => Promise<boolean>

export function useDelayState(step: Step | undefined, onSave: OnSave) {
  const [view, setView] = useState<DelayView>(() => stepToDelayView(step))

  const stepId = step?.id
  const delayDays = step?.delayDays
  const delayMinutes = step?.delayMinutes
  const delayUnit = step?.delayUnit
  const specificDateTimeMs = step?.specificDateTime?.getTime()

  // Re-derive the view from the raw stored delay fields — not `step` object
  // identity — so a server refresh that returns unchanged delay data does
  // not clobber a pending local edit.
  useEffect(() => {
    const storedFields: StoredDelayFields | undefined =
      stepId === undefined
        ? undefined
        : {
            delayDays: delayDays ?? 0,
            delayMinutes: delayMinutes ?? 0,
            delayUnit,
            specificDateTime:
              specificDateTimeMs === undefined
                ? null
                : new Date(specificDateTimeMs),
          }

    setView(stepToDelayView(storedFields))
  }, [stepId, delayDays, delayMinutes, delayUnit, specificDateTimeMs])

  const saveView = useCallback(
    async (nextView: DelayView, previousView: DelayView) => {
      const success = await onSave({
        delay: {
          unit: nextView.unit,
          value: nextView.value,
          specificDateTime: nextView.specificDateTime || undefined,
        },
      })

      if (!success) {
        setView(previousView)
      }
    },
    [onSave],
  )

  const handleDelayUnitChange = useCallback(
    (unit: DelayUnit) => {
      const previousView = view
      const specificDateTime =
        unit === "specificTime" && !view.specificDateTime
          ? oneHourFromNowLocal()
          : view.specificDateTime
      const nextView: DelayView = { ...view, unit, specificDateTime }

      setView(nextView)
      saveView(nextView, previousView)
    },
    [view, saveView],
  )

  const handleDelayValueChange = useCallback(
    (value: number) => {
      const previousView = view
      const nextView: DelayView = { ...view, value }

      setView(nextView)
      saveView(nextView, previousView)
    },
    [view, saveView],
  )

  const handleSpecificDateTimeChange = useCallback(
    (dateTime: string) => {
      const previousView = view
      const nextView: DelayView = {
        ...view,
        unit: "specificTime",
        specificDateTime: dateTime,
      }

      setView(nextView)

      if (dateTime) {
        saveView(nextView, previousView)
      }
    },
    [view, saveView],
  )

  return {
    delayUnit: view.unit,
    delayValue: view.value,
    specificDateTime: view.specificDateTime,
    handleDelayUnitChange,
    handleDelayValueChange,
    handleSpecificDateTimeChange,
  }
}
