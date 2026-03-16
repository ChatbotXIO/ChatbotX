import { useCallback, useState } from "react"
import { type Step, WEEKDAY_ORDER } from "./use-sequence-step"

export function useTimeRangeState(
  step: Step | undefined,
  onSave: (fields: {
    anytime?: boolean
    sendTimeStart?: string | null
    sendTimeEnd?: string | null
    sendDays?: string[]
  }) => Promise<void>,
) {
  const [timeOption, setTimeOption] = useState<"anytime" | "between">(
    step?.anytime === false ? "between" : "anytime",
  )
  const [startTime, setStartTime] = useState(step?.sendTimeStart || "09:00")
  const [endTime, setEndTime] = useState(step?.sendTimeEnd || "17:00")
  const [selectedDays, setSelectedDays] = useState<string[]>(
    step?.sendDays ? JSON.parse(step.sendDays) : [...WEEKDAY_ORDER],
  )

  const handleTimeOptionChange = useCallback(
    (option: "anytime" | "between") => {
      setTimeOption(option)

      if (option === "between") {
        onSave({
          anytime: false,
          sendTimeStart: startTime,
          sendTimeEnd: endTime,
          sendDays: selectedDays,
        })
      } else {
        onSave({
          anytime: true,
          sendTimeStart: null,
          sendTimeEnd: null,
          sendDays: [...WEEKDAY_ORDER],
        })
      }
    },
    [startTime, endTime, selectedDays, onSave],
  )

  const handleStartTimeChange = useCallback(
    (time: string) => {
      setStartTime(time)
      onSave({ sendTimeStart: time })
    },
    [onSave],
  )

  const handleEndTimeChange = useCallback(
    (time: string) => {
      setEndTime(time)
      onSave({ sendTimeEnd: time })
    },
    [onSave],
  )

  const handleSelectedDaysChange = useCallback(
    (days: string[]) => {
      setSelectedDays(days)
      onSave({ sendDays: days })
    },
    [onSave],
  )

  return {
    timeOption,
    startTime,
    endTime,
    selectedDays,
    handleTimeOptionChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleSelectedDaysChange,
  }
}
