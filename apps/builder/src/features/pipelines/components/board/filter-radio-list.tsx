"use client"

import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { useId } from "react"

type FilterRadioListProps<T extends string> = {
  options: ReadonlyArray<{ value: T; label: string }>
  /** `undefined` leaves every radio unchecked. */
  value: T | undefined
  onValueChange: (value: T) => void
  ariaLabel: string
}

/** A vertical list of radios; each label is the accessible name of its radio. */
export function FilterRadioList<T extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
}: FilterRadioListProps<T>) {
  const groupId = useId()
  return (
    <RadioGroup
      aria-label={ariaLabel}
      className="gap-2"
      onValueChange={(next) => onValueChange(next as T)}
      value={value ?? ""}
    >
      {options.map((option) => {
        const id = `${groupId}-${option.value}`
        return (
          <label
            className="flex items-center gap-2"
            htmlFor={id}
            key={option.value}
          >
            <RadioGroupItem id={id} value={option.value} />
            {option.label}
          </label>
        )
      })}
    </RadioGroup>
  )
}
