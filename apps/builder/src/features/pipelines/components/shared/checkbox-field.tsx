"use client"

import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { type ReactNode, useId } from "react"

type CheckboxFieldProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  children: ReactNode
}

/** A checkbox with its label; the label text is the accessible name. */
export function CheckboxField({
  checked,
  onCheckedChange,
  disabled,
  children,
}: CheckboxFieldProps) {
  const id = useId()
  return (
    <label className="flex items-center gap-2" htmlFor={id}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={onCheckedChange}
      />
      {children}
    </label>
  )
}

type CheckboxGroupProps<T extends string> = {
  options: ReadonlyArray<{ value: T; label: string }>
  selected: T[] | undefined
  onToggle: (value: T) => void
}

/** A vertical list of checkboxes over a fixed set of options. */
export function CheckboxGroup<T extends string>({
  options,
  selected,
  onToggle,
}: CheckboxGroupProps<T>) {
  return (
    <div className="grid gap-2">
      {options.map((option) => (
        <CheckboxField
          checked={selected?.includes(option.value) ?? false}
          key={option.value}
          onCheckedChange={() => onToggle(option.value)}
        >
          {option.label}
        </CheckboxField>
      ))}
    </div>
  )
}
