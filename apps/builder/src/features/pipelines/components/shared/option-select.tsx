"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"

export type SelectOption = { value: string; label: string }

type OptionSelectProps = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  /** Fires as the list opens or closes, e.g. to load the options lazily. */
  onOpenChange?: (open: boolean) => void
  options: SelectOption[]
  /** Label of the empty (`""`) choice; omit when a value is always required. */
  emptyLabel?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
}

/** The base-ui select reserves null for "nothing", so `""` travels as this sentinel. */
const EMPTY_VALUE = "__empty__"

/** A single-choice select over plain `{ value, label }` options; `""` is the empty choice. */
export function OptionSelect({
  id,
  value,
  onValueChange,
  onOpenChange,
  options,
  emptyLabel,
  ariaLabel,
  disabled,
  className,
}: OptionSelectProps) {
  const items = emptyLabel
    ? [{ value: EMPTY_VALUE, label: emptyLabel }, ...options]
    : options
  return (
    <Select
      disabled={disabled}
      items={items}
      onOpenChange={onOpenChange}
      onValueChange={(next) =>
        onValueChange(
          typeof next !== "string" || next === EMPTY_VALUE ? "" : next,
        )
      }
      value={value === "" && emptyLabel ? EMPTY_VALUE : value}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={className ?? "w-full"}
        id={id}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
