"use client"

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@chatbotx.io/ui/components/ui/toggle-group"
import { useFormatter, useTranslations } from "next-intl"

export type CountedOption<Value extends string> = {
  /** `undefined` shows no count (not counted, or still loading). */
  count: number | undefined
  label: string
  value: Value
}

/** A segmented single choice whose segments may carry a post count. */
export const CountedToggleGroup = <Value extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: Value) => void
  options: readonly CountedOption<Value>[]
  value: Value
}) => {
  const t = useTranslations()
  const formatter = useFormatter()
  return (
    <ToggleGroup
      aria-label={label}
      className="w-auto flex-wrap"
      onValueChange={(values) => {
        const next = options.find((option) => option.value === values[0])
        if (next && next.value !== value) {
          onChange(next.value)
        }
      }}
      value={[value]}
      variant="outline"
    >
      {options.map((option) => (
        <ToggleGroupItem
          aria-label={
            option.count === undefined
              ? option.label
              : t("posts.calendar.list.filterCount", {
                  count: option.count,
                  label: option.label,
                })
          }
          className="w-auto flex-none gap-1.5 whitespace-nowrap px-3"
          key={option.value}
          value={option.value}
        >
          {option.label}
          {option.count === undefined ? null : (
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatter.number(option.count)}
            </span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
