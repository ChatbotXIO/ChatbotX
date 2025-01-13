"use client"

import { type ComponentType, forwardRef } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SelectProps } from "@radix-ui/react-select"

type SingleOptions = {
  /** The text to display for the option. */
  label: string
  /** The unique value associated with the option. */
  value: string
  /** Optional icon component to display alongside the option. */
  icon?: ComponentType<{ className?: string }>
}

interface SingleSelectProps extends SelectProps {
  options: SingleOptions[]
  placeholder?: string
}

export const SingleSelect = forwardRef<HTMLButtonElement, SingleSelectProps>(
  ({ options, placeholder, ...rest }, ref) => {
    return (
      <Select value="gpt-4-turbo" {...rest}>
        <SelectTrigger ref={ref}>
          <SelectValue placeholder={placeholder || "Select item"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((item: SingleOptions) => (
            <SelectItem
              key={item.value}
              value={item.value}
              className="capitalize"
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  },
)

SingleSelect.displayName = "SingleSelect"
