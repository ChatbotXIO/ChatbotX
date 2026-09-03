import { useCallback, useEffect, useRef, useState } from "react"
import {
  type DelayChange,
  type DelayUnit,
  type DelayView,
  oneHourFromNowLocal,
  type StoredDelayFields,
  stepToDelayView,
} from "../lib/delay"
import type { Step } from "./use-sequence-step"

type OnSave = (fields: { delay: DelayChange }) => Promise<boolean>

function isSameView(a: DelayView, b: DelayView): boolean {
  return (
    a.unit === b.unit &&
    a.value === b.value &&
    a.specificDateTime === b.specificDateTime
  )
}

export function useDelayState(step: Step | undefined, onSave: OnSave) {
  const initialView = stepToDelayView(step)
  const [view, setView] = useState<DelayView>(initialView)
  const persistedViewRef = useRef<DelayView>(initialView)

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

    const nextView = stepToDelayView(storedFields)
    persistedViewRef.current = nextView

    setView((current) => (isSameView(current, nextView) ? current : nextView))
  }, [stepId, delayDays, delayMinutes, delayUnit, specificDateTimeMs])

  // Optimistically shows `nextView`, then persists it. On success, records
  // it as the last-persisted view. On failure, reverts — but only if no
  // newer optimistic change has since replaced it (an older failed save
  // must never clobber a newer in-flight or already-applied edit).
  const commitView = useCallback(
    async (nextView: DelayView) => {
      setView(nextView)

      const saved = await onSave({
        delay: {
          unit: nextView.unit,
          value: nextView.value,
          specificDateTime: nextView.specificDateTime || undefined,
        },
      })

      if (saved) {
        persistedViewRef.current = nextView
      } else {
        setView((current) =>
          current === nextView ? persistedViewRef.current : current,
        )
      }
    },
    [onSave],
  )

  const handleDelayUnitChange = useCallback(
    (unit: DelayUnit) => {
      const specificDateTime =
        unit === "specificTime" && !view.specificDateTime
          ? oneHourFromNowLocal()
          : view.specificDateTime
      const nextView: DelayView = { ...view, unit, specificDateTime }

      commitView(nextView)
    },
    [view, commitView],
  )

  const handleDelayValueChange = useCallback(
    (value: number) => {
      const nextView: DelayView = { ...view, value }

      commitView(nextView)
    },
    [view, commitView],
  )

  const handleSpecificDateTimeChange = useCallback(
    (dateTime: string) => {
      const nextView: DelayView = {
        ...view,
        unit: "specificTime",
        specificDateTime: dateTime,
      }

      if (dateTime) {
        commitView(nextView)
      } else {
        setView(nextView)
      }
    },
    [view, commitView],
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
